import { notFound } from "next/navigation";
import Link from "next/link";
import { readDb } from "@/lib/db";
import { Alert, Badge, Card } from "@/components/ui/primitives";
import { FindingsList } from "./findings-list";
import { ReviewPoller } from "./review-poller";

export default function ReviewDetailPage({ params }: { params: { id: string } }) {
  const db = readDb();
  const review = db.reviews.find((r) => r.id === params.id);
  if (!review) notFound();

  return (
    <div>
      <Link href="/dashboard/history" className="text-xs text-neutral-500 hover:text-neutral-200">← History</Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{review.title}</h1>
        <Badge tone={review.status === "completed" ? "ok" : review.status === "failed" ? "critical" : "warn"}>{review.status}</Badge>
        <Badge tone="neutral">{review.inputType}</Badge>
      </div>
      <p className="mt-1 font-mono text-xs text-neutral-500">
        {review.id} · {new Date(review.createdAt).toLocaleString()} · model {review.model ?? "—"}
      </p>

      {(review.status === "queued" || review.status === "working") && (
        <Alert kind="info" className="mt-4">Processing… the worker picks up queued jobs every few seconds. This page refreshes automatically. Make sure <span className="font-mono">npm run worker</span> is running.</Alert>
      )}
      {review.incomplete && (
        <Alert kind="warn" className="mt-4">Incomplete review{review.incompleteReason ? `: ${review.incompleteReason}` : "."} Treat results as partial.</Alert>
      )}
      {review.status === "failed" && (
        <Alert kind="error" className="mt-4">Failed: {review.error ?? "unknown error"}</Alert>
      )}
      <div className="mt-4"><ReviewPoller id={review.id} status={review.status} /></div>

      <h2 className="mb-2 mt-8 text-sm font-medium uppercase tracking-wide text-neutral-400">Summary</h2>
      <Card className="p-4 text-sm leading-relaxed text-neutral-200">{review.summary ?? "Not available yet."}</Card>

      <h2 className="mb-2 mt-8 text-sm font-medium uppercase tracking-wide text-neutral-400">Findings ({review.findings.length})</h2>
      <FindingsList reviewId={review.id} findings={review.findings} />

      <h2 className="mb-2 mt-8 text-sm font-medium uppercase tracking-wide text-neutral-400">Submitted {review.inputType}</h2>
      <pre className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-xs leading-relaxed text-neutral-300">{review.content.slice(0, 20000)}</pre>
    </div>
  );
}
