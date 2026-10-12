import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/auth";
import { supabaseService, supabaseConfigured } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

const SEV_COLORS: Record<string, string> = {
  critical: "bg-red-500/15 text-red-300",
  high: "bg-orange-500/15 text-orange-300",
  medium: "bg-amber-500/15 text-amber-300",
  low: "bg-blue-500/15 text-blue-300",
  info: "bg-neutral-800 text-neutral-400",
};

export default async function ReviewDetailPage({ params }: { params: { id: string } }) {
  if (!supabaseConfigured()) notFound();
  const account = await requireAccount();
  const db = supabaseService();
  const { data: review } = await db.from("reviews").select("*").eq("id", params.id).maybeSingle();
  if (!review || review.account_id !== account.id) notFound(); // 404, not 403 — no cross-account leakage
  const { data: findings } = await db.from("findings").select("*").eq("review_id", review.id).order("created_at");
  const skipped = (review.skipped_files || []) as { path: string; reason: string }[];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reviews" className="text-sm text-neutral-500 underline decoration-neutral-700 underline-offset-4 hover:text-white">← Reviews</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold tracking-tight">{review.repo_full_name} #{review.pr_number}</h1>
          <StatusBadge status={review.status} />
        </div>
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-neutral-500">
          <div>reviewed <dt className="sr-only">head SHA</dt><dd className="inline">{review.head_sha}</dd></div>
          {review.base_sha && <div>base <dd className="inline">{String(review.base_sha).slice(0, 7)}</dd></div>}
          {review.prev_head_sha && <div>incremental since <dd className="inline">{String(review.prev_head_sha).slice(0, 7)}</dd></div>}
          <div>mode <dd className="inline">{review.mode}</dd></div>
        </dl>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          {review.github_pr_url && <a href={review.github_pr_url} target="_blank" rel="noreferrer" className="text-neutral-300 underline decoration-neutral-600 underline-offset-4 hover:text-white">View PR on GitHub</a>}
          {review.github_review_id && review.github_pr_url && (
            <a href={`${review.github_pr_url}#pullrequestreview-${review.github_review_id}`} target="_blank" rel="noreferrer" className="text-neutral-300 underline decoration-neutral-600 underline-offset-4 hover:text-white">View posted review</a>
          )}
        </div>
      </div>

      {review.status === "failed" && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Review failed: {review.error || "unknown error"} {review.attempts ? `(after ${review.attempts} attempts)` : ""}
        </p>
      )}
      {(review.status === "skipped" || review.status === "superseded") && review.incomplete_reason && (
        <p role="status" className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-neutral-300">
          {review.status === "skipped" ? "Skipped: " : "Superseded: "}{review.incomplete_reason}
        </p>
      )}
      {review.incomplete && review.status === "completed" && (
        <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Incomplete coverage: {review.incomplete_reason || "the model flagged this review as incomplete."} Treat a lack of findings as unknown, not clean.
        </p>
      )}

      {review.summary && (
        <section aria-label="Summary" className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-5">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">Summary</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">{review.summary}</p>
        </section>
      )}

      <section aria-label="Findings">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">Findings ({findings?.length || 0})</h2>
        {!findings?.length ? (
          <p className="rounded-lg border border-dashed border-neutral-800 px-4 py-6 text-center text-sm text-neutral-500">
            {review.status === "completed" ? "No findings — no concrete bugs, security, validation, error-handling, or performance issues were identified in the reviewed changes." : "Findings appear here once the review completes."}
          </p>
        ) : (
          <ul className="space-y-3">
            {findings.map((f) => (
              <li key={f.id} className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs ${SEV_COLORS[f.severity] || SEV_COLORS.info}`}>{f.severity}</span>
                  <strong className="text-sm">{f.title}</strong>
                </div>
                {f.file && <p className="mt-1 font-mono text-xs text-neutral-500">{f.file}{f.line ? `:${f.line}` : ""}{f.inline_posted ? " · posted inline" : " · summary only"}</p>}
                <p className="mt-2 text-sm text-neutral-300">{f.explanation}</p>
                {f.evidence && <pre className="mt-2 overflow-x-auto rounded-md border border-neutral-800 bg-neutral-950 p-3 font-mono text-xs text-neutral-400">{f.evidence}</pre>}
                <p className="mt-2 text-sm"><span className="text-neutral-500">Suggested fix: </span><span className="text-neutral-200">{f.suggestion}</span></p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {skipped.length > 0 && (
        <section aria-label="Skipped files">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">Skipped files ({skipped.length})</h2>
          <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
            {skipped.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-4 py-2 font-mono text-xs">
                <span className="text-neutral-300">{s.path}</span>
                <span className="text-neutral-500">{s.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
