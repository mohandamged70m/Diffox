"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Finding } from "@/lib/db";
import { Alert, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Check, EyeOff, Loader2 } from "lucide-react";

const tone: Record<string, "critical" | "high" | "medium" | "low" | "info"> = {
  critical: "critical", high: "high", medium: "medium", low: "low", info: "info",
};

export function FindingsList({ reviewId, findings }: { reviewId: string; findings: Finding[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(id: string, status: "resolved" | "dismissed" | "open") {
    setBusy(id); setError(null);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/findings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId: id, status }),
      });
      if (!res.ok) { setError("Update failed."); return; }
      router.refresh();
    } catch { setError("Update failed (network)."); }
    finally { setBusy(null); }
  }

  const groups = ["critical", "high", "medium", "low", "info"].map((sev) => ({
    sev, items: findings.filter((f) => f.severity === sev),
  })).filter((g) => g.items.length > 0);

  if (findings.length === 0) return <p className="rounded-lg border border-neutral-800 p-5 text-sm text-neutral-400">No findings. The reviewer reported no actionable issues.</p>;

  return (
    <div className="grid gap-6">
      {error && <Alert kind="error">{error}</Alert>}
      {groups.map((g) => (
        <section key={g.sev} aria-label={`${g.sev} findings`}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium capitalize text-neutral-300">
            <Badge tone={tone[g.sev]}>{g.sev}</Badge><span className="text-neutral-500">{g.items.length}</span>
          </h3>
          <div className="grid gap-2">
            {g.items.map((f) => (
              <article key={f.id} className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-medium">{f.title}</h4>
                  {f.status !== "open" && <Badge tone={f.status === "resolved" ? "ok" : "neutral"}>{f.status}</Badge>}
                  {!f.verified && <Badge tone="warn">unverified ref</Badge>}
                </div>
                <p className="mt-1 font-mono text-xs text-neutral-500">
                  {f.file ?? "no file ref"}{f.line ? `:${f.line}` : ""}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-neutral-300">{f.explanation}</p>
                <p className="mt-2 text-sm leading-relaxed"><span className="text-neutral-500">Fix: </span>{f.suggestion}</p>
                {f.excerpt && <pre className="mt-2 overflow-x-auto rounded-md border border-neutral-800 bg-neutral-950 p-3 text-xs leading-relaxed text-neutral-300">{f.excerpt}</pre>}
                <div className="mt-3 flex gap-2">
                  {f.status === "open" ? (
                    <>
                      <Button size="sm" variant="outline" disabled={busy === f.id} onClick={() => setStatus(f.id, "resolved")}>
                        {busy === f.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Resolve
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy === f.id} onClick={() => setStatus(f.id, "dismissed")}>
                        <EyeOff size={14} />Dismiss
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={busy === f.id} onClick={() => setStatus(f.id, "open")}>Reopen</Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
