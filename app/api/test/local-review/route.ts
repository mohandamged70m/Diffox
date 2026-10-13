import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccount } from "@/lib/auth";
import { supabaseService, supabaseConfigured } from "@/lib/supabase/server";
import { isLocalTestMode } from "@/lib/env";

const Body = z.object({
  repo_full_name: z.string().min(1).max(200).default("local/test-repo"),
  pr_number: z.coerce.number().int().positive().default(1),
  head_sha: z.string().min(4).max(64).default("localheadsha"),
  diff: z.string().min(10).max(120000),
});

/**
 * LOCAL TEST MODE ONLY (DIFFOX_LOCAL_TEST=1).
 * Enqueues a simulated review of a pasted diff — exercises the real worker
 * pipeline (AI call, validation, dedupe, persistence) without GitHub.
 * Results are always labeled [SIMULATED] and must never be presented as real
 * GitHub reviews. Returns 404 when local test mode is off.
 */
export async function POST(req: Request) {
  if (!isLocalTestMode()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    if (!supabaseConfigured()) return NextResponse.json({ error: "Database not configured." }, { status: 501 });
    const account = await requireAccount();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Provide a diff (10–120,000 chars)." }, { status: 400 });
    const b = parsed.data;
    const db = supabaseService();
    const dedupeKey = `${account.id}:local:${b.repo_full_name}#${b.pr_number}@${b.head_sha}:${Date.now()}`;
    const { data: review, error: revErr } = await db
      .from("reviews")
      .insert({
        account_id: account.id, repository_id: null, repo_full_name: b.repo_full_name,
        pr_number: b.pr_number, head_sha: b.head_sha, mode: "full", status: "queued",
        fixture_diff: b.diff,
      })
      .select("id")
      .single();
    if (revErr || !review) return NextResponse.json({ error: "Could not enqueue test review." }, { status: 500 });
    const { error: jobError } = await db.from("review_jobs").insert({
      account_id: account.id, review_id: review.id, repo_full_name: b.repo_full_name,
      pr_number: b.pr_number, head_sha: b.head_sha, status: "queued", dedupe_key: dedupeKey,
    });
    if (jobError) {
      await db.from("reviews").update({ status: "failed", error: "Could not enqueue test job." }).eq("id", review.id);
      return NextResponse.json({ error: "Could not enqueue test job." }, { status: 500 });
    }
    return NextResponse.json({
      review_id: review.id,
      warning: "SIMULATED review — local test mode only, not a real GitHub result.",
    });
  } catch (e) {
    const status = (e as { status?: number })?.status === 401 ? 401 : 500;
    return NextResponse.json({ error: (e as Error)?.message || "Request failed." }, { status });
  }
}
