import { requireAccount } from "@/lib/auth";
import { supabaseService, supabaseConfigured } from "@/lib/supabase/server";
import { RepoRow } from "@/components/repo-row";

export const dynamic = "force-dynamic";

export default async function RepositoriesPage() {
  if (!supabaseConfigured()) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Repositories</h1>
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">Database not configured. Set Supabase variables and apply the migration, then connect the GitHub App in Settings.</p>
      </div>
    );
  }
  const account = await requireAccount();
  const db = supabaseService();
  const { data: repos } = await db
    .from("repositories")
    .select("id, full_name, auto_review, excluded_paths")
    .eq("account_id", account.id)
    .order("full_name");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Repositories</h1>
        <p className="mt-1 text-sm text-neutral-400">Installed repositories, automatic-review toggle, and excluded paths.</p>
      </div>
      {!repos?.length ? (
        <p className="rounded-lg border border-dashed border-neutral-800 px-4 py-6 text-center text-sm text-neutral-500">
          No repositories yet. Install the GitHub App in Settings — the repository list syncs server-side from GitHub.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900/30">
          {repos.map((r) => <RepoRow key={r.id} repo={r} />)}
        </ul>
      )}
    </div>
  );
}
