import Link from "next/link";
import { requireAccount } from "@/lib/auth";
import { supabaseService, supabaseConfigured } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

const STATUSES = ["queued", "running", "completed", "skipped", "superseded", "failed"] as const;

export default async function ReviewsPage({ searchParams }: { searchParams: { status?: string } }) {
  if (!supabaseConfigured()) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">Database not configured. Review history appears here once Supabase is connected and the worker processes jobs.</p>
      </div>
    );
  }
  const account = await requireAccount();
  const db = supabaseService();
  let query = db
    .from("reviews")
    .select("id, repo_full_name, pr_number, head_sha, mode, status, created_at, completed_at")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (searchParams.status && (STATUSES as readonly string[]).includes(searchParams.status)) {
    query = query.eq("status", searchParams.status);
  }
  const { data: reviews } = await query;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
        <p className="mt-1 text-sm text-neutral-400">Real review history — every state from queued to failed.</p>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
        <Link href="/reviews" className={`rounded-full px-3 py-1 text-xs ${!searchParams.status ? "bg-neutral-100 text-neutral-950" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}>All</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/reviews?status=${s}`}
            className={`rounded-full px-3 py-1 text-xs ${searchParams.status === s ? "bg-neutral-100 text-neutral-950" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}>{s}</Link>
        ))}
      </div>
      {!reviews?.length ? (
        <p className="rounded-lg border border-dashed border-neutral-800 px-4 py-6 text-center text-sm text-neutral-500">
          No reviews{searchParams.status ? ` with status “${searchParams.status}”` : " yet"}. Open a pull request in a connected repository.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900/30">
          {reviews.map((r) => (
            <li key={r.id}>
              <Link href={`/reviews/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-neutral-900/60">
                <span>
                  <span className="font-mono text-sm">{r.repo_full_name} #{r.pr_number}</span>
                  <span className="ml-2 font-mono text-xs text-neutral-500">{r.head_sha.slice(0, 7)} · {r.mode}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-neutral-500">{new Date(r.created_at).toLocaleString()}</span>
                  <StatusBadge status={r.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
