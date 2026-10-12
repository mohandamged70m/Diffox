/**
 * ReviewKit review worker — separate Node.js process with a durable Postgres queue.
 *
 * Run:  npm run worker   (requires Supabase + GitHub App + AI key configured)
 *
 * How it works:
 *  1. Polls `review_jobs` and atomically claims one job (conditional UPDATE on
 *     status/lease, so N workers never double-claim; stale leases are reclaimed
 *     after a crash — see claimJob()).
 *  2. Resolves the repository installation + the account's AI config, fetches the
 *     PR at the expected head SHA, pages through changed files, skips binaries /
 *     generated / lockfiles / excluded paths, reads surrounding code at the
 *     reviewed commit, batches input, asks the model for structured findings,
 *     validates + dedupes them, re-checks the PR is still open at the same SHA,
 *     then publishes ONE GitHub review (COMMENT event — never approve /
 *     request-changes / merge) and persists the GitHub review id.
 *  3. Retries with a lease + bounded attempts; retries reconcile already-posted
 *     reviews via a hidden marker so a crash never creates duplicate feedback.
 *
 * Local test mode (REVIEWKIT_LOCAL_TEST=1): processes jobs with a canned
 * SIMULATED result and never touches GitHub. Simulated reviews are always
 * labeled and must never be presented as real GitHub results.
 */
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Octokit } from "octokit";
import { chatCompletion, withBackoff } from "../lib/providers/openai-compatible";
import { classifyError } from "../lib/providers/types";
import { buildReviewMessages } from "../lib/review/prompt";
import { parseReviewOutput } from "../lib/review/schema";
import { classifyFile } from "../lib/review/filter";
import { parseDiffSides, mapToInlinePosition, dedupeFindings } from "../lib/github/positions";

const POLL_MS = Number(process.env.WORKER_POLL_MS || 5000);
const LEASE_MS = 10 * 60 * 1000;
const MAX_BATCH_CHARS = 48_000;
const MAX_CONTEXT_FILES_PER_BATCH = 4;
const MAX_CONTEXT_CHARS = 15_000;
const MAX_INLINE_COMMENTS = 25;

const WORKER_ID = `worker-${crypto.randomBytes(4).toString("hex")}`;

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Worker needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function isLocalTest(): boolean {
  return process.env.REVIEWKIT_LOCAL_TEST === "1";
}

interface Job {
  id: string; account_id: string; review_id: string | null;
  repo_full_name: string; pr_number: number; head_sha: string;
  status: string; attempts: number; max_attempts: number;
}

/** Atomic claim: exactly one worker wins the conditional UPDATE. */
async function claimJob(supabase: ReturnType<typeof db>): Promise<Job | null> {
  const { data: candidates } = await supabase
    .from("review_jobs")
    .select("id")
    .or(`status.eq.queued,and(status.eq.running,lease_expires_at.lt.${new Date().toISOString()})`)
    .lt("attempts", 4)
    .order("created_at", { ascending: true })
    .limit(3);
  if (!candidates?.length) return null;

  for (const c of candidates) {
    const lease = new Date(Date.now() + LEASE_MS).toISOString();
    const { data, error } = await supabase
      .from("review_jobs")
      .update({ status: "running", lease_expires_at: lease, claimed_by: WORKER_ID, updated_at: new Date().toISOString() })
      .eq("id", c.id)
      .or(`status.eq.queued,and(status.eq.running,lease_expires_at.lt.${new Date().toISOString()})`)
      .select("id, account_id, review_id, repo_full_name, pr_number, head_sha, status, attempts, max_attempts");
    if (!error && data?.length) {
      const job = data[0] as Job;
      // Count the attempt at claim time (covers crashes mid-processing).
      await supabase.from("review_jobs").update({ attempts: job.attempts + 1 }).eq("id", job.id);
      job.attempts += 1;
      await supabase.from("reviews").update({ status: "running", attempts: job.attempts, updated_at: new Date().toISOString() }).eq("id", job.review_id);
      return job;
    }
  }
  return null;
}

/** Sweep jobs that exhausted attempts while running (crash recovery → failed, never stuck). */
async function sweepExhausted(supabase: ReturnType<typeof db>) {
  const { data: stale } = await supabase
    .from("review_jobs")
    .select("id, review_id")
    .eq("status", "running")
    .lt("lease_expires_at", new Date().toISOString())
    .gte("attempts", 4);
  for (const j of stale || []) {
    await supabase.from("review_jobs").update({ status: "failed", last_error: "Worker crashed or timed out after max attempts.", updated_at: new Date().toISOString() }).eq("id", j.id);
    if (j.review_id) {
      await supabase.from("reviews").update({ status: "failed", error: "Worker crashed or timed out after max attempts.", updated_at: new Date().toISOString() }).eq("id", j.review_id);
    }
  }
}

function parseRepo(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) throw new Error(`Invalid repo full_name: ${fullName}`);
  return { owner, repo };
}

async function installationToken(installationId: number): Promise<string> {
  const appId = process.env.GITHUB_APP_ID;
  let privateKey = process.env.GITHUB_APP_PRIVATE_KEY || "";
  if (!appId || !privateKey) throw new Error("GitHub App not configured (worker).");
  if (!privateKey.includes("BEGIN")) privateKey = Buffer.from(privateKey, "base64").toString("utf8");
  const { createAppAuth } = await import("@octokit/auth-app");
  const auth = createAppAuth({ appId, privateKey });
  const { token } = await auth({ type: "installation", installationId });
  return token as string;
}

async function decryptConfig(keyEnc: unknown): Promise<string> {
  const { decryptApiKey } = await import("../lib/crypto");
  return decryptApiKey(keyEnc as { v: number; iv: string; tag: string; data: string });
}

/** Build inline-position state from per-file patches (synthesized diff headers). */
function sidesFromPatches(files: { filename: string; patch?: string }[]) {
  const diff = files
    .filter((f) => f.patch)
    .map((f) => `diff --git a/${f.filename} b/${f.filename}\n+++ b/${f.filename}\n${f.patch}`)
    .join("\n");
  return parseDiffSides(diff);
}

function reviewMarker(reviewId: string): string {
  return `<!-- reviewkit:${reviewId} -->`;
}

function summaryBody(opts: {
  reviewId: string; summary: string; mode: string; headSha: string;
  reviewed: { filename: string }[]; skipped: { path: string; reason: string }[];
  unattached: { file: string | null; title: string; explanation: string; suggestion: string; severity: string }[];
  incomplete: boolean; incompleteReason: string | null; simulated: boolean;
}): string {
  const lines = [
    reviewMarker(opts.reviewId),
    opts.simulated ? "**[SIMULATED — local test mode, not a real review]**" : null,
    `ReviewKit ${opts.mode} review of \`${opts.headSha.slice(0, 7)}\``,
    "",
    opts.summary,
    "",
    `Files reviewed: ${opts.reviewed.length}. Skipped: ${opts.skipped.length}.`,
    ...(opts.skipped.length ? ["", "**Skipped files**", ...opts.skipped.map((s) => `- \`${s.path}\` — ${s.reason}`)] : []),
    ...(opts.unattached.length ? ["", "**Other findings (no exact diff location)**", ...opts.unattached.map((f) => `- **[${f.severity}]** ${f.file ? `\`${f.file}\` — ` : ""}${f.title}: ${f.explanation} Suggested fix: ${f.suggestion}`)] : []),
    ...(opts.incomplete ? ["", `**Incomplete coverage:** ${opts.incompleteReason || "the model flagged this review as incomplete."} Treat a lack of findings as unknown, not clean.`] : []),
  ].filter((l) => l !== null);
  return lines.join("\n");
}

async function processJob(supabase: ReturnType<typeof db>, job: Job) {
  const { data: review } = await supabase.from("reviews").select("*").eq("id", job.review_id).maybeSingle();
  if (!review) {
    await supabase.from("review_jobs").update({ status: "failed", last_error: "Review row missing." }).eq("id", job.id);
    return;
  }
  if (review.github_review_id && review.status === "completed") {
    await supabase.from("review_jobs").update({ status: "completed" }).eq("id", job.id);
    return; // already reconciled
  }

  // ---- Local test mode: no GitHub. Results always labeled SIMULATED. ----
  if (isLocalTest()) {
    await runLocalFixture(supabase, job, review);
    return;
  }

  try {
    // Resolve installation + AI config for this account (repository_id is the stable key).
    const { data: repoLookup } = await supabase.from("repositories")
      .select("installation_id, auto_review, excluded_paths")
      .eq("id", review.repository_id)
      .maybeSingle();
    if (!repoLookup) throw Object.assign(new Error("Repository no longer connected."), { terminal: true });
    if (!repoLookup.auto_review) {
      await skipBoth(supabase, job, review.id, "Automatic review is disabled for this repository.");
      return;
    }
    const { data: aiRow } = await supabase.from("ai_configs").select("model, key_enc").eq("account_id", job.account_id).maybeSingle();
    if (!aiRow) {
      await skipBoth(supabase, job, review.id, "AI key not configured.");
      return;
    }
    let apiKey: string;
    try {
      apiKey = await decryptConfig(aiRow.key_enc);
    } catch {
      await skipBoth(supabase, job, review.id, "AI key cannot be decrypted (ENCRYPTION_SECRET mismatch?).");
      return;
    }

    const token = await installationToken(Number(repoLookup.installation_id));
    const octo = new Octokit({ auth: token });
    const { owner, repo } = parseRepo(job.repo_full_name);

    // Fetch PR + verify expected head SHA.
    const { data: pr } = await octo.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
      owner, repo, pull_number: job.pr_number,
    });
    if (pr.state === "closed") {
      await skipBoth(supabase, job, review.id, "PR was closed before review.");
      return;
    }
    if (pr.draft) {
      await skipBoth(supabase, job, review.id, "PR is a draft.");
      return;
    }
    if (pr.head.sha !== job.head_sha) {
      await supersedeBoth(supabase, job, review.id, `PR head moved (${job.head_sha.slice(0, 7)} → ${pr.head.sha.slice(0, 7)}); a newer job owns this PR.`);
      return;
    }

    // Changed files with pagination.
    interface PrFile { filename: string; patch?: string; status: string }
    const files: PrFile[] = [];
    if (review.prev_head_sha && review.mode === "incremental") {
      try {
        const cmp = await octo.request("GET /repos/{owner}/{repo}/compare/{basehead}", {
          owner, repo, basehead: `${review.prev_head_sha}...${job.head_sha}`,
        });
        for (const f of cmp.data.files || []) files.push({ filename: f.filename, patch: f.patch, status: f.status });
      } catch {
        review.mode = "full"; // incompatible history → fall back to full review
        review.prev_head_sha = null;
      }
    }
    if (!files.length && !(review.prev_head_sha && review.mode === "incremental")) {
      for (let page = 1; page <= 10; page++) {
        const res = await octo.request("GET /repos/{owner}/{repo}/pulls/{pull_number}/files", {
          owner, repo, pull_number: job.pr_number, per_page: 100, page,
        });
        for (const f of res.data) files.push({ filename: f.filename, patch: f.patch, status: f.status });
        if (res.data.length < 100) break;
      }
    }

    // Triage.
    const excluded = (repoLookup.excluded_paths || []) as string[];
    const reviewable = files.filter((f) => f.patch);
    const skipped: { path: string; reason: string }[] = [];
    const kept: PrFile[] = [];
    for (const f of files) {
      if (!f.patch) {
        skipped.push({ path: f.filename, reason: f.status === "removed" ? "file removed" : "no patch (binary or too large)" });
        continue;
      }
      const c = classifyFile(f.filename, excluded);
      if (c.skip) skipped.push({ path: f.filename, reason: c.reason || "skipped" });
      else kept.push(f);
    }
    if (!kept.length) {
      await supabase.from("reviews").update({
        status: "completed", summary: "No reviewable code changes (all files skipped).", skipped_files: skipped,
        incomplete: skipped.length > 0, incomplete_reason: skipped.length ? "All changed files were skipped." : null,
        completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", review.id);
      await supabase.from("review_jobs").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", job.id);
      return;
    }

    // Batches bounded for the model.
    const batches: PrFile[][] = [];
    let cur: PrFile[] = [];
    let curChars = 0;
    for (const f of kept) {
      const len = (f.patch || "").length;
      if (cur.length && curChars + len > MAX_BATCH_CHARS) {
        batches.push(cur);
        cur = [];
        curChars = 0;
      }
      cur.push(f);
      curChars += len;
    }
    if (cur.length) batches.push(cur);

    const baseURL = (process.env.AI_PROVIDER_BASE_URL || "https://opencode.ai/zen/v1").replace(/\/+$/, "");
    const sides = sidesFromPatches(files);
    const allFindings: { severity: string; title: string; file: string | null; line: number | null; explanation: string; suggestion: string; evidence: string | null }[] = [];
    let batchSummaries: string[] = [];
    let coverageGaps: string[] = [];
    if (review.mode === "incremental" && review.prev_head_sha) {
      coverageGaps.push(`Incremental review of changes since ${review.prev_head_sha.slice(0, 7)}; earlier code was covered by a prior review.`);
    }

    for (const batch of batches) {
      // Surrounding code at the reviewed commit (bounded; labeled untrusted context).
      let contextParts: string[] = [];
      for (const f of batch.slice(0, MAX_CONTEXT_FILES_PER_BATCH)) {
        try {
          const res = await octo.request("GET /repos/{owner}/{repo}/contents/{path}", {
            owner, repo, path: f.filename, ref: job.head_sha,
            headers: { accept: "application/vnd.github.raw" },
          });
          const rawBody = res.data as unknown;
          const text = typeof rawBody === "string" ? rawBody : "";
          if (text) contextParts.push(`--- ${f.filename} @ ${job.head_sha.slice(0, 7)} (truncated) ---\n${text.slice(0, MAX_CONTEXT_CHARS)}`);
        } catch {
          coverageGaps.push(`Could not read surrounding code for ${f.filename}; reviewed the diff hunks only.`);
        }
      }
      const diffText = batch.map((f) => `File: ${f.filename}\n${f.patch}`).join("\n\n").slice(0, MAX_BATCH_CHARS);
      const messages = buildReviewMessages({
        inputType: "diff", content: diffText, language: null,
        context: contextParts.join("\n\n").slice(0, 40_000) || null, instructions: null,
      });
      const raw = await withBackoff(
        () => chatCompletion({ baseURL, apiKey, model: aiRow.model }, messages, { maxTokens: 4000 }),
        3
      );
      let parsed;
      try {
        parsed = parseReviewOutput(raw);
      } catch {
        throw Object.assign(new Error("Model returned malformed (non-schema) output."), { retryable: true });
      }
      batchSummaries.push(parsed.summary);
      if (parsed.incomplete) coverageGaps.push("The model flagged a batch as incomplete.");
      for (const x of parsed.findings) {
        allFindings.push({ severity: x.severity, title: x.title, file: x.file ?? null, line: x.line ?? null, explanation: x.explanation, suggestion: x.suggestion, evidence: x.excerpt ?? null });
      }
    }

    // Validate + dedupe. Inline-attachable findings go inline; the rest go in the summary.
    const deduped = dedupeFindings(allFindings);
    const inline: { path: string; line: number; side: "RIGHT"; body: string }[] = [];
    const unattached: { file: string | null; title: string; explanation: string; suggestion: string; severity: string }[] = [];
    for (const f of deduped.slice(0, 60)) {
      const pos = mapToInlinePosition(sides, f.file, f.line);
      const body = `**[${f.severity}] ${f.title}**\n\n${f.explanation}\n\n${f.evidence ? `Evidence: \`${f.evidence.slice(0, 500)}\`\n\n` : ""}Suggested fix: ${f.suggestion}`;
      if (pos.valid && inline.length < MAX_INLINE_COMMENTS) {
        inline.push({ path: pos.path, line: pos.line, side: "RIGHT", body });
      } else {
        unattached.push({ file: f.file, title: f.title, explanation: f.explanation, suggestion: f.suggestion, severity: f.severity });
      }
    }

    // Re-check the PR is still open at the same SHA before publishing.
    const { data: pr2 } = await octo.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
      owner, repo, pull_number: job.pr_number,
    });
    if (pr2.state === "closed") {
      await skipBoth(supabase, job, review.id, "PR was closed before publishing.");
      return;
    }
    if (pr2.head.sha !== job.head_sha) {
      await supersedeBoth(supabase, job, review.id, "PR head moved before publishing; a newer job owns this PR.");
      return;
    }

    // Reconcile: adopt an already-posted review (same marker) instead of double-posting.
    let githubReviewId: number | null = review.github_review_id || null;
    if (!githubReviewId) {
      const existing = await octo.request("GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
        owner, repo, pull_number: job.pr_number, per_page: 100,
      });
      const hit = (existing.data as { id: number; body?: string }[]).find((r) => r.body?.includes(reviewMarker(review.id)));
      if (hit) githubReviewId = hit.id;
    }
    const summary = batchSummaries.join("\n\n").slice(0, 6000);
    if (!githubReviewId) {
      const posted = await octo.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
        owner, repo, pull_number: job.pr_number,
        commit_id: job.head_sha, event: "COMMENT",
        body: summaryBody({
          reviewId: review.id, summary, mode: review.mode, headSha: job.head_sha,
          reviewed: kept, skipped, unattached,
          incomplete: coverageGaps.length > 0 || skipped.length > 0,
          incompleteReason: coverageGaps.join(" ") || (skipped.length ? "Some files were skipped (listed above)." : null),
          simulated: false,
        }),
        comments: inline,
      });
      githubReviewId = Number(posted.data.id);
    }

    // Persist (findings replaced idempotently so retries never duplicate rows).
    await supabase.from("findings").delete().eq("review_id", review.id);
    if (deduped.length) {
      await supabase.from("findings").insert(deduped.map((f) => ({
        review_id: review.id, file: f.file, line: f.line, severity: f.severity,
        title: f.title, explanation: f.explanation, suggestion: f.suggestion,
        evidence: f.evidence, inline_posted: inline.some((c) => c.path === f.file && c.line === f.line),
      })));
    }
    await supabase.from("reviews").update({
      status: "completed", summary, mode: review.mode, prev_head_sha: review.prev_head_sha,
      incomplete: coverageGaps.length > 0 || skipped.length > 0,
      incomplete_reason: coverageGaps.join(" ") || (skipped.length ? "Some files were skipped (listed above)." : null),
      skipped_files: skipped, github_review_id: githubReviewId, error: null,
      completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", review.id);
    await supabase.from("review_jobs").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", job.id);
    console.log(`[${WORKER_ID}] reviewed ${job.repo_full_name}#${job.pr_number}@${job.head_sha.slice(0, 7)} (${deduped.length} findings, ${inline.length} inline)`);
  } catch (e) {
    const c = classifyError(e);
    const terminal = (e as { terminal?: boolean })?.terminal === true || c.kind === "auth" || c.kind === "model";
    if ((e as { status?: number })?.status === 401 || c.kind === "auth") {
      await supabase.from("ai_configs").update({ status: "invalid", last_error: c.message }).eq("account_id", job.account_id);
    }
    if (terminal || job.attempts >= job.max_attempts) {
      await supabase.from("review_jobs").update({ status: "failed", last_error: c.message, updated_at: new Date().toISOString() }).eq("id", job.id);
      await supabase.from("reviews").update({ status: "failed", error: c.message, updated_at: new Date().toISOString() }).eq("id", review.id);
    } else {
      // Release for retry with the lease expired now.
      await supabase.from("review_jobs").update({ status: "queued", lease_expires_at: null, last_error: c.message, updated_at: new Date().toISOString() }).eq("id", job.id);
      await supabase.from("reviews").update({ status: "queued", updated_at: new Date().toISOString() }).eq("id", review.id);
    }
    console.error(`[${WORKER_ID}] job ${job.id} error: ${c.message}`);
  }
}

/**
 * Local test mode: run the REAL model pipeline on a pasted fixture diff
 * (structured output, validation, dedupe, persistence) without GitHub.
 * No AI config → canned pipeline-OK result. Everything is labeled SIMULATED.
 */
async function runLocalFixture(supabase: ReturnType<typeof db>, job: Job, review: { id: string; fixture_diff?: string | null }) {
  const done = async (patch: Record<string, unknown>) => {
    await supabase.from("reviews").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", review.id);
    const status = typeof patch.status === "string" ? patch.status : "completed";
    await supabase.from("review_jobs").update({ status, updated_at: new Date().toISOString() }).eq("id", job.id);
  };
  const fixture = (review.fixture_diff as string) || "";
  const { data: aiRow } = await supabase.from("ai_configs").select("model, key_enc").eq("account_id", job.account_id).maybeSingle();
  if (!fixture || !aiRow) {
    await done({
      status: "completed",
      summary: "[SIMULATED — local test mode, not a real GitHub review] Job-claim → process → persist pipeline OK." + (fixture ? "" : " (No fixture diff attached.)") + (aiRow ? "" : " (No AI key configured — attach one in Settings to run the model pipeline locally.)"),
      incomplete: false, incomplete_reason: null, skipped_files: [], error: null,
      completed_at: new Date().toISOString(),
    });
    console.log(`[${WORKER_ID}] simulated job ${job.id} completed (canned)`);
    return;
  }
  try {
    const apiKey = await decryptConfig(aiRow.key_enc);
    const baseURL = (process.env.AI_PROVIDER_BASE_URL || "https://opencode.ai/zen/v1").replace(/\/+$/, "");
    const sides = parseDiffSides(fixture);
    const raw = await withBackoff(
      () => chatCompletion({ baseURL, apiKey, model: aiRow.model },
        buildReviewMessages({ inputType: "diff", content: fixture.slice(0, 60_000), language: null, context: null, instructions: null }),
        { maxTokens: 4000 }),
      3
    );
    const parsed = parseReviewOutput(raw);
    const deduped = dedupeFindings(parsed.findings.map((f) => ({
      severity: f.severity, title: f.title, file: f.file ?? null, line: f.line ?? null,
      explanation: f.explanation, suggestion: f.suggestion, evidence: f.excerpt ?? null,
    })));
    // Validate positions against the fixture diff (same rule as production: no fabrication).
    const valid = deduped.filter((f) => {
      if (!f.file) return true;
      return mapToInlinePosition(sides, f.file, f.line).valid || f.line == null;
    });
    await supabase.from("findings").delete().eq("review_id", review.id);
    if (valid.length) {
      await supabase.from("findings").insert(valid.map((f) => ({
        review_id: review.id, file: f.file, line: f.line, severity: f.severity,
        title: f.title, explanation: f.explanation, suggestion: f.suggestion,
        evidence: f.evidence, inline_posted: false,
      })));
    }
    await done({
      status: "completed",
      summary: `[SIMULATED — local test mode, not a real GitHub review]\n\n${parsed.summary}`,
      incomplete: parsed.incomplete, incomplete_reason: parsed.incomplete ? "Model flagged the fixture review as incomplete." : null,
      skipped_files: [], error: null, completed_at: new Date().toISOString(),
    });
    console.log(`[${WORKER_ID}] simulated job ${job.id} completed via model (${valid.length} findings)`);
  } catch (e) {
    const c = classifyError(e);
    if (job.attempts >= job.max_attempts) {
      await done({ status: "failed", error: `[SIMULATED] ${c.message}` });
    } else {
      await supabase.from("review_jobs").update({ status: "queued", lease_expires_at: null, last_error: c.message }).eq("id", job.id);
    }
    console.error(`[${WORKER_ID}] simulated job ${job.id} error: ${c.message}`);
  }
}

async function skipBoth(supabase: ReturnType<typeof db>, job: Job, reviewId: string, reason: string) {
  await supabase.from("reviews").update({ status: "skipped", incomplete_reason: reason, updated_at: new Date().toISOString() }).eq("id", reviewId);
  await supabase.from("review_jobs").update({ status: "skipped", updated_at: new Date().toISOString() }).eq("id", job.id);
}

async function supersedeBoth(supabase: ReturnType<typeof db>, job: Job, reviewId: string, reason: string) {
  await supabase.from("reviews").update({ status: "superseded", incomplete_reason: reason, updated_at: new Date().toISOString() }).eq("id", reviewId);
  await supabase.from("review_jobs").update({ status: "superseded", updated_at: new Date().toISOString() }).eq("id", job.id);
}

async function main() {
  console.log(`[${WORKER_ID}] ReviewKit worker polling every ${POLL_MS}ms (localTest=${isLocalTest()})`);
  const supabase = db();
  for (;;) {
    try {
      await sweepExhausted(supabase);
      const job = await claimJob(supabase);
      if (job) {
        await processJob(supabase, job);
      } else {
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    } catch (e) {
      console.error(`[${WORKER_ID}] loop error`, (e as Error)?.message);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
}

main();
