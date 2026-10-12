/** Pure review-publishing helpers (shared by the worker; unit-tested). */

export function reviewMarker(reviewId: string): string {
  return `<!-- reviewkit:${reviewId} -->`;
}

/** Find a previously posted ReviewKit review body by its hidden marker (crash-retry reconciliation). */
export function findPostedReviewId(
  reviews: { id: number; body?: string | null }[],
  reviewId: string
): number | null {
  const hit = reviews.find((r) => r.body?.includes(reviewMarker(reviewId)));
  return hit ? hit.id : null;
}

export interface SummaryInput {
  reviewId: string;
  summary: string;
  mode: string;
  headSha: string;
  reviewed: { filename: string }[];
  skipped: { path: string; reason: string }[];
  unattached: { file: string | null; title: string; explanation: string; suggestion: string; severity: string }[];
  incomplete: boolean;
  incompleteReason: string | null;
  simulated: boolean;
}

/** GitHub review body: summary + explicit coverage accounting. Never claims clean on partial work. */
export function summaryBody(o: SummaryInput): string {
  const lines: string[] = [
    reviewMarker(o.reviewId),
    ...(o.simulated ? ["**[SIMULATED — local test mode, not a real review]**"] : []),
    `ReviewKit ${o.mode} review of \`${o.headSha.slice(0, 7)}\``,
    "",
    o.summary,
    "",
    `Files reviewed: ${o.reviewed.length}. Skipped: ${o.skipped.length}.`,
    ...(o.skipped.length
      ? ["", "**Skipped files**", ...o.skipped.map((s) => `- \`${s.path}\` — ${s.reason}`)]
      : []),
    ...(o.unattached.length
      ? ["", "**Other findings (no exact diff location)**", ...o.unattached.map((f) => `- **[${f.severity}]** ${f.file ? `\`${f.file}\` — ` : ""}${f.title}: ${f.explanation} Suggested fix: ${f.suggestion}`)]
      : []),
    ...(o.incomplete
      ? ["", `**Incomplete coverage:** ${o.incompleteReason || "the model flagged this review as incomplete."} Treat a lack of findings as unknown, not clean.`]
      : []),
  ];
  return lines.join("\n");
}

/** Deterministic job dedupe key: same account + repo + PR + SHA enqueues exactly once. */
export function buildDedupeKey(accountId: string, repoFullName: string, prNumber: number, headSha: string): string {
  return `${accountId}:${repoFullName}#${prNumber}@${headSha}`;
}

export type HeadState = "ok" | "closed" | "draft" | "stale";

/** Decide whether the PR is still reviewable at the job's SHA (checked before AND after the AI call). */
export function classifyHeadState(pr: { state: string; draft: boolean; headSha: string }, jobHeadSha: string): HeadState {
  if (pr.state === "closed") return "closed";
  if (pr.draft) return "draft";
  if (pr.headSha !== jobHeadSha) return "stale";
  return "ok";
}
