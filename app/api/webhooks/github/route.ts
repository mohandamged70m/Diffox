import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/github/webhook";
import { supabaseService, supabaseConfigured } from "@/lib/supabase/server";
import { getAiConfigStatus } from "@/lib/ai-config";

/**
 * GitHub App webhook. Verifies HMAC, dedupes deliveries, enqueues durable jobs.
 * NEVER performs the AI review here — the worker does that asynchronously.
 */
export async function POST(req: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET || "";
  if (!secret) return NextResponse.json({ error: "Webhook not configured." }, { status: 501 });
  if (!supabaseConfigured()) return NextResponse.json({ error: "Database not configured." }, { status: 501 });

  const raw = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get("x-hub-signature-256");
  if (!verifyWebhookSignature({ rawBody: raw, signatureHeader: signature, secret })) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const event = req.headers.get("x-github-event") || "";
  const delivery = req.headers.get("x-github-delivery") || "";
  if (!delivery) return NextResponse.json({ error: "Missing delivery ID." }, { status: 400 });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const db = supabaseService();

  // Deduplicate deliveries (retries / redeliveries).
  const { error: delErr } = await db
    .from("webhook_deliveries")
    .insert({ delivery_id: delivery, event, action: (payload.action as string) || null });
  if (delErr) {
    if (delErr.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
    return NextResponse.json({ error: "Delivery log failed." }, { status: 500 });
  }

  try {
    if (event === "installation" || event === "installation_repositories") {
      await handleInstallationEvent(db, event, payload);
      return NextResponse.json({ ok: true });
    }
    if (event === "pull_request") {
      return await handlePullRequest(db, payload);
    }
    return NextResponse.json({ ok: true, ignored: event });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || "Webhook handling failed." }, { status: 500 });
  }
}

type Db = ReturnType<typeof supabaseService>;

async function handleInstallationEvent(db: Db, event: string, payload: Record<string, unknown>) {
  const action = payload.action as string;
  const installation = payload.installation as { id: number; account: { login: string; type: string } };
  if (!installation?.id) return;
  if (event === "installation" && action === "deleted") {
    // GitHub source of truth: remove every binding for this installation id.
    const { data: rows } = await db.from("installations").select("account_id").eq("installation_id", installation.id);
    for (const r of rows || []) {
      await db.from("repositories").delete().eq("account_id", r.account_id).eq("installation_id", installation.id);
    }
    await db.from("installations").delete().eq("installation_id", installation.id);
    return;
  }
  // added / created / repository added|removed → re-sync repository list server-side.
  if (action === "deleted") return;
  const { installationOctokit } = await import("@/lib/github/app");
  const { data: owners } = await db.from("installations").select("account_id").eq("installation_id", installation.id);
  if (!owners?.length) return; // not connected by any ReviewKit account
  let repos: { id: number; full_name: string }[] = [];
  try {
    const octo = await installationOctokit(installation.id);
    for (let page = 1; page <= 10; page++) {
      const res = await octo.request("GET /installation/repositories", { per_page: 100, page });
      for (const r of res.data.repositories) repos.push({ id: Number(r.id), full_name: r.full_name });
      if (res.data.repositories.length < 100) break;
    }
  } catch {
    return; // transient GitHub failure — a later event or manual reconnect re-syncs
  }
  const wanted = new Set(repos.map((r) => r.id));
  for (const o of owners) {
    for (const r of repos) {
      await db.from("repositories").upsert(
        { account_id: o.account_id, installation_id: installation.id, github_repo_id: r.id, full_name: r.full_name, updated_at: new Date().toISOString() },
        { onConflict: "account_id,github_repo_id" }
      );
    }
    const { data: existing } = await db.from("repositories").select("github_repo_id").eq("account_id", o.account_id).eq("installation_id", installation.id);
    for (const e of existing || []) {
      if (!wanted.has(e.github_repo_id)) {
        await db.from("repositories").delete().eq("account_id", o.account_id).eq("github_repo_id", e.github_repo_id);
      }
    }
  }
}

async function handlePullRequest(db: Db, payload: Record<string, unknown>) {
  const action = payload.action as string;
  if (!["opened", "synchronize", "ready_for_review"].includes(action)) {
    return NextResponse.json({ ok: true, ignored: action });
  }
  const pr = payload.pull_request as {
    number: number; state: string; draft: boolean;
    head: { sha: string }; base: { sha: string };
    html_url: string;
  };
  const repo = payload.repository as { id: number; full_name: string };
  const installation = payload.installation as { id: number } | undefined;
  if (!pr || !repo || !installation?.id) return NextResponse.json({ ok: true, ignored: "missing-context" });

  // Skip drafts and closed PRs.
  if (pr.draft) return NextResponse.json({ ok: true, skipped: "draft" });
  if (pr.state === "closed") return NextResponse.json({ ok: true, skipped: "closed" });

  // Resolve owning account(s) from the installation — never trust browser data here.
  const { data: owners } = await db.from("installations").select("account_id").eq("installation_id", installation.id);
  if (!owners?.length) return NextResponse.json({ ok: true, skipped: "unconnected-installation" });

  const results: unknown[] = [];
  for (const o of owners) {
    results.push(await enqueueForAccount(db, o.account_id, repo, pr));
  }
  return NextResponse.json({ ok: true, results });
}

async function enqueueForAccount(
  db: Db,
  accountId: string,
  repo: { id: number; full_name: string },
  pr: { number: number; head: { sha: string }; base: { sha: string }; html_url: string }
) {
  const headSha = pr.head.sha;
  // Repository must be known and auto-review enabled.
  const { data: repoRow } = await db
    .from("repositories")
    .select("id, auto_review")
    .eq("account_id", accountId)
    .eq("github_repo_id", repo.id)
    .maybeSingle();
  if (!repoRow) return { account: accountId, skipped: "repo-not-connected" };

  const skippedReview = async (reason: string) => {
    const { data } = await db
      .from("reviews")
      .insert({
        account_id: accountId, repository_id: repoRow.id, repo_full_name: repo.full_name,
        pr_number: pr.number, head_sha: headSha, base_sha: pr.base.sha,
        mode: "full", status: "skipped", incomplete_reason: reason, github_pr_url: pr.html_url,
      })
      .select("id")
      .single();
    return { review_id: data?.id, skipped: reason };
  };

  if (!repoRow.auto_review) return skippedReview("Automatic review is disabled for this repository.");
  const ai = await getAiConfigStatus(accountId);
  if (!ai.configured) return skippedReview("AI key not configured.");

  // Supersede older queued work for the same PR (a newer push wins).
  await db.from("review_jobs")
    .update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("account_id", accountId).eq("repo_full_name", repo.full_name).eq("pr_number", pr.number)
    .eq("status", "queued").neq("head_sha", headSha);
  await db.from("reviews")
    .update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("account_id", accountId).eq("repo_full_name", repo.full_name).eq("pr_number", pr.number)
    .eq("status", "queued").neq("head_sha", headSha);

  // Incremental base: last successfully reviewed SHA for this PR.
  const { data: lastDone } = await db
    .from("reviews")
    .select("head_sha")
    .eq("account_id", accountId).eq("repo_full_name", repo.full_name).eq("pr_number", pr.number)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prevHeadSha = lastDone?.head_sha && lastDone.head_sha !== headSha ? lastDone.head_sha : null;

  // Idempotency: same repo + PR + SHA (+ account) enqueues exactly once.
  const dedupeKey = `${accountId}:${repo.full_name}#${pr.number}@${headSha}`;
  const { data: review } = await db
    .from("reviews")
    .insert({
      account_id: accountId, repository_id: repoRow.id, repo_full_name: repo.full_name,
      pr_number: pr.number, head_sha: headSha, base_sha: pr.base.sha,
      prev_head_sha: prevHeadSha, mode: prevHeadSha ? "incremental" : "full",
      status: "queued", github_pr_url: pr.html_url,
    })
    .select("id")
    .single();
  if (!review) return { skipped: "review-insert-failed" };

  const { error: jobErr } = await db.from("review_jobs").insert({
    account_id: accountId, review_id: review.id, repo_full_name: repo.full_name,
    pr_number: pr.number, head_sha: headSha, status: "queued", dedupe_key: dedupeKey,
  });
  if (jobErr) {
    if (jobErr.code === "23505") {
      // Duplicate delivery raced the first: drop the extra review row.
      await db.from("reviews").delete().eq("id", review.id);
      return { duplicate: true };
    }
    await db.from("reviews").update({ status: "failed", error: jobErr.message }).eq("id", review.id);
    return { error: jobErr.message };
  }
  return { review_id: review.id, mode: prevHeadSha ? "incremental" : "full" };
}
