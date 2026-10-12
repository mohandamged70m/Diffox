"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Card, Input, Label, Textarea } from "@/components/ui/primitives";
import { Loader2 } from "lucide-react";

export function NewReviewForm() {
  const router = useRouter();
  const [inputType, setInputType] = useState<"diff" | "snippet">("diff");
  const [content, setContent] = useState("");
  const [language, setLanguage] = useState("typescript");
  const [context, setContext] = useState("");
  const [instructions, setInstructions] = useState("");
  const [repository, setRepository] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputType, content, language, context, instructions, repository }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error || "Submission failed."); return; }
      router.push(`/dashboard/reviews/${j.review.id}`);
    } catch { setError("Submission failed (network)."); }
    finally { setBusy(false); }
  }

  const valid = content.trim().length >= 10 && content.length <= 120000;

  return (
    <div className="grid gap-5">
      <Card className="p-5">
        <Label>Review type</Label>
        <div className="flex gap-2" role="radiogroup" aria-label="Review type">
          {(["diff", "snippet"] as const).map((t) => (
            <button key={t} role="radio" aria-checked={inputType === t} onClick={() => setInputType(t)}
              className={`rounded-md border px-4 py-2 text-sm ${inputType === t ? "border-neutral-200 bg-neutral-100 text-neutral-950" : "border-neutral-700 text-neutral-300 hover:bg-neutral-900"}`}>
              {t === "diff" ? "Unified diff" : "Code snippet"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          {inputType === "diff"
            ? "Diff reviews verify file paths and line numbers against the hunks."
            : "Snippet reviews cannot verify file references — findings will show as unverified."}
        </p>
      </Card>
      <div className="grid gap-5 md:grid-cols-[1fr_240px]">
        <div>
          <Label htmlFor="code">{inputType === "diff" ? "Unified diff" : "Code"}</Label>
          <Textarea id="code" rows={16} value={content} onChange={(e) => setContent(e.target.value)}
            placeholder={inputType === "diff" ? "diff --git a/app.ts b/app.ts\n..." : "paste code here…"} />
          <p className="mt-1 text-xs text-neutral-500">{content.length.toLocaleString()} / 120,000 chars</p>
        </div>
        <div className="grid content-start gap-4">
          <div>
            <Label htmlFor="lang">Language {inputType === "snippet" ? "" : "(optional)"}</Label>
            <Input id="lang" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="typescript" />
          </div>
          <div>
            <Label htmlFor="repo">Repository (optional)</Label>
            <Input id="repo" value={repository} onChange={(e) => setRepository(e.target.value)} placeholder="owner/repo" />
          </div>
        </div>
      </div>
      <div>
        <Label htmlFor="ctx">Related code (optional)</Label>
        <Textarea id="ctx" rows={4} value={context} onChange={(e) => setContext(e.target.value)} placeholder="Interfaces, callers, tests…" />
      </div>
      <div>
        <Label htmlFor="instr">Project instructions (optional)</Label>
        <Textarea id="instr" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Conventions the reviewer should respect…" />
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <div>
        <Button onClick={submit} disabled={busy || !valid}>
          {busy && <Loader2 size={16} className="animate-spin" />}Review code
        </Button>
        {!valid && <p className="mt-2 text-xs text-neutral-500">Enter 10–120,000 characters to enable review.</p>}
      </div>
    </div>
  );
}
