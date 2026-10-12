import Link from "next/link";
import { readDb } from "@/lib/db";
import { Badge, Card, Input, Label } from "@/components/ui/primitives";

export default function HistoryPage({ searchParams }: { searchParams: { q?: string; status?: string; severity?: string; repo?: string } }) {
  const db = readDb();
  const q = (searchParams.q || "").toLowerCase();
  const status = searchParams.status || "";
  const severity = searchParams.severity || "";
  const repo = (searchParams.repo || "").toLowerCase();

  const items = [...db.reviews]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((r) => {
      if (status && r.status !== status) return false;
      if (repo && !(r.repository || "").toLowerCase().includes(repo)) return false;
      if (severity && !r.findings.some((f) => f.severity === severity && f.status === "open")) return false;
      if (q && !(r.title + r.content + (r.summary || "")).toLowerCase().includes(q)) return false;
      return true;
    });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Review History</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-400">{db.reviews.length} stored review(s).</p>
      <form method="get" className="grid gap-3 md:grid-cols-4">
        <div><Label htmlFor="q">Search</Label><Input id="q" name="q" defaultValue={searchParams.q || ""} placeholder="text…" /></div>
        <div><Label htmlFor="repo">Repository</Label><Input id="repo" name="repo" defaultValue={searchParams.repo || ""} placeholder="owner/repo" /></div>
        <div><Label htmlFor="status">Status</Label>
          <select id="status" name="status" defaultValue={status} className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 text-sm">
            <option value="">all</option><option value="queued">queued</option><option value="working">working</option>
            <option value="completed">completed</option><option value="failed">failed</option>
          </select>
        </div>
        <div><Label htmlFor="sev">Severity</Label>
          <select id="sev" name="severity" defaultValue={severity} className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 text-sm">
            <option value="">all</option><option value="critical">critical</option><option value="high">high</option>
            <option value="medium">medium</option><option value="low">low</option>
          </select>
        </div>
      </form>
      <div className="mt-4 grid gap-2">
        {items.length === 0 ? (
          <Card className="p-5 text-sm text-neutral-400">No reviews match. Try clearing filters, or create one from New Review.</Card>
        ) : items.map((r) => (
          <Link key={r.id} href={`/dashboard/reviews/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 hover:border-neutral-600">
            <span>
              <span className="block text-sm font-medium">{r.title}</span>
              <span className="block font-mono text-xs text-neutral-500">{new Date(r.createdAt).toLocaleString()} · {r.repository || "manual"} · {r.findings.length} findings</span>
            </span>
            <Badge tone={r.status === "completed" ? "ok" : r.status === "failed" ? "critical" : "warn"}>{r.status}</Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}
