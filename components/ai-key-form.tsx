"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AiKeyForm({ hasKey, encryptionReady, providerEndpoint }: {
  hasKey: boolean;
  encryptionReady: boolean;
  providerEndpoint: string;
}) {
  const router = useRouter();
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: model.trim(), apiKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed.");
      setMessage({ kind: "ok", text: `Key verified and saved for model ${json.model}.` });
      setApiKey("");
      router.refresh();
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ai-config/test", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Test failed.");
      setMessage({ kind: "ok", text: `Connection OK — model ${json.model} reachable.` });
      router.refresh();
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete the saved AI key? Automatic reviews will pause until a new key is saved.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ai-config", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed.");
      setMessage({ kind: "ok", text: "Key deleted." });
      router.refresh();
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!encryptionReady && (
        <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Saving is disabled: the server is missing <code>ENCRYPTION_SECRET</code> (32+ chars). Keys are encrypted with AES-256-GCM before storage and are never shown again.
        </p>
      )}
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="rk-model" className="mb-1 block text-sm text-neutral-300">Model</label>
          <input
            id="rk-model" value={model} onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. glacial-coder-7b" autoComplete="off" required
            className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-neutral-500">Any model ID your key can access at <span className="font-mono">{providerEndpoint}</span>.</p>
        </div>
        <div>
          <label htmlFor="rk-key" className="mb-1 block text-sm text-neutral-300">{hasKey ? "Replace API key" : "API key"}</label>
          <input
            id="rk-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…" autoComplete="new-password" required minLength={8}
            className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy || !encryptionReady}
            className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-950 disabled:opacity-40">
            {hasKey ? "Verify & replace key" : "Verify & save key"}
          </button>
          {hasKey && (
            <>
              <button type="button" onClick={test} disabled={busy}
                className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-40">Test saved key</button>
              <button type="button" onClick={remove} disabled={busy}
                className="rounded-md border border-red-900/60 px-4 py-2 text-sm text-red-300 hover:bg-red-950/40 disabled:opacity-40">Delete key</button>
            </>
          )}
        </div>
      </form>
      {message && (
        <p role={message.kind === "err" ? "alert" : "status"}
          className={`rounded-lg border px-4 py-2.5 text-sm ${message.kind === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-red-500/30 bg-red-500/10 text-red-200"}`}>
          {message.text}
        </p>
      )}
      <p className="text-xs leading-relaxed text-neutral-500">
        Repository code you review is sent to the provider above. Saved keys are AES-256-GCM
        encrypted, never returned to the browser, and never logged. No free or unlimited model
        usage is included — you bring your own key.
      </p>
    </div>
  );
}
