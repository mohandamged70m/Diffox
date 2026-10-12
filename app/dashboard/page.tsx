import Link from "next/link";
import { readDb } from "@/lib/db";
import { Badge, Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export default function OverviewPage() {
  const db = readDb();
  const recent = [...db.reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const active = db.reviews.filter((r) => r.status === "queued" || r.status === "working");
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const r of db.reviews) for (const f of r.findings) {
    if (f.status !== "open") continue;
    if (f.severity in counts) counts[f.severity as keyof typeof counts]++;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-neutral-400">Real stored reviews. No demo data.</p>
        </div>
        <Link href="/dashboard/new"><Button>New review</Button></Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(Object.keys(counts) as (keyof typeof counts)[]).map((s) => (
          <Card key={s} className="p-4">
            <p className="text-xs uppercase tracking-wide text-neutral-500">{s}</p>
            <p className="mt-1 text-2xl font-semibold">{counts[s]}</p>
            <p className="text-xs text-neutral-500">open findings</p>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-medium uppercase tracking-wide text-neutral-400">Active jobs ({active.length})</h2>
      {active.length === 0 ? (
        <Card className="p-5 text-sm text-neutral-400">No active jobs. Submit code from <Link href="/dashboard/new" className="underline">New Review</Link>.</Card>
      ) : (
        <div className="grid gap-2">
          {active.map((r) => (
            <Link key={r.id} href={`/dashboard/reviews/${r.id}`} className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 hover:border-neutral-600">
              <span className="flex items-center gap-2 text-sm font-medium">{r.title}<Badge tone="warn">{r.status}</Badge></span>
            </Link>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-sm font-medium uppercase tracking-wide text-neutral-400">Recent reviews</h2>
      {recent.length === 0 ? (
        <Card className="p-5 text-sm text-neutral-400">No reviews yet. Paste a diff or snippet to get your first AI review.</Card>
      ) : (
        <div className="grid gap-2">
          {recent.map((r) => (
            <Link key={r.id} href={`/dashboard/reviews/${r.id}`} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 hover:border-neutral-600">
              <span className="text-sm font-medium">{r.title}</span>
              <Badge tone={r.status === "completed" ? "ok" : r.status === "failed" ? "critical" : "warn"}>{r.status}</Badge>
            </Link>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-sm font-medium uppercase tracking-wide text-neutral-400">Connected repositories</h2>
      <Card className="p-5 text-sm text-neutral-400">GitHub integration not configured. Manual reviews work without it — see Repositories.</Card>
    </div>
  );
}
