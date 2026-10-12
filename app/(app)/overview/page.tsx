import { requireAccount } from "@/lib/auth";
import { supabaseService } from "@/lib/supabase/server";
import { configuredFlags } from "@/lib/env";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const flags = configuredFlags();
  if (!flags.supabase || !flags.clerk) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          {!flags.clerk && <p>Clerk is not configured. Set <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and <code>CLERK_SECRET_KEY</code>.</p>}
          {!flags.supabase && <p>Supabase is not configured. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code>, then apply <code>supabase/migrations/0001_init.sql</code>.</p>}
          <p className="mt-2 text-amber-200/70">See README for local setup.</p>
        </div>
      </div>
    );
  }

  const account = await requireAccount();
  const db = supabaseService();
  const [{ data: repos }, { data: reviews }, { data: ai }] = await Promise.all([
    db.from("repositories").select("id, full_name, auto_review").eq("account_id", account.id).order("full_name"),
    db.from("reviews").select("id, repo_full_name, pr_number, head_sha, status, created_at").eq("account_id", account.id).order("created_at", { ascending: false }).limit(10),
    db.from("ai_configs").select("model, status").eq("account_id", account.id).maybeSingle(),
  ]);

  const steps = [
    { label: "Sign in", done: true },
    { label: ai ? `AI configured (${ai.model})` : "Configure AI key", done: Boolean(ai), href: "/settings" },
    { label: repos?.length ? `${repos.length} repositor${repos.length === 1 ? "y" : "ies"} connected` : "Install GitHub App", done: Boolean(repos?.length), href: "/settings" },
    { label: "Open a PR to get a review", done: Boolean(reviews?.length) },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-neutral-400">Connected repositories, recent reviews, and setup progress.</p>
      </div>

      <section aria-label="Setup progress">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">Setup progress</h2>
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-2.5 text-sm">
              <span aria-hidden className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${s.done ? "bg-emerald-500/20 text-emerald-300" : "bg-neutral-800 text-neutral-500"}`}>
                {s.done ? "✓" : i + 1}
              </span>
              {s.href && !s.done ? <Link href={s.href} className="underline decoration-neutral-600 underline-offset-4 hover:text-white">{s.label}</Link> : <span className={s.done ? "text-neutral-200" : "text-neutral-400"}>{s.label}</span>}
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Connected repositories">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Connected repositories</h2>
          <Link href="/repositories" className="text-sm text-neutral-400 underline decoration-neutral-700 underline-offset-4 hover:text-white">Manage</Link>
        </div>
        {!repos?.length ? (
          <p className="rounded-lg border border-dashed border-neutral-800 px-4 py-6 text-center text-sm text-neutral-500">No repositories connected yet. Install the GitHub App to begin.</p>
        ) : (
          <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
            {repos.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-mono text-[13px]">{r.full_name}</span>
                <span className="text-xs text-neutral-500">{r.auto_review ? "Auto-review on" : "Auto-review off"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Recent reviews">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Recent reviews</h2>
          <Link href="/reviews" className="text-sm text-neutral-400 underline decoration-neutral-700 underline-offset-4 hover:text-white">View all</Link>
        </div>
        {!reviews?.length ? (
          <p className="rounded-lg border border-dashed border-neutral-800 px-4 py-6 text-center text-sm text-neutral-500">No reviews yet. Open a pull request in a connected repository.</p>
        ) : (
          <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
            {reviews.map((r) => (
              <li key={r.id}>
                <Link href={`/reviews/${r.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-neutral-900/60">
                  <span className="font-mono text-[13px]">{r.repo_full_name} #{r.pr_number}</span>
                  <StatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
