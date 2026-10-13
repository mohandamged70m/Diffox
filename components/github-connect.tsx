"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function GitHubConnect({ installUrl, appConfigured }: { installUrl: string; appConfigured: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(params.get("installed") ? "GitHub redirected back. Confirm the installation below to finish connecting." : null);
  const [installationId, setInstallationId] = useState(params.get("installation_id") || "");

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/github/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installation_id: Number(installationId) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Connect failed.");
      router.refresh();
      setMessage(`Connected ${json.installation.account_login} — ${json.repositories} repositories synced.`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!appConfigured) {
    return (
      <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        GitHub App is not configured server-side. Set <code>GITHUB_APP_ID</code>, <code>GITHUB_APP_PRIVATE_KEY</code>, and <code>GITHUB_WEBHOOK_SECRET</code> — see <code>docs/github-app.md</code>.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <a href={installUrl} target="_blank" rel="noreferrer"
        className="inline-block rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-950">
        Install GitHub App
      </a>
      <form onSubmit={connect} className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="rk-installation" className="mb-1 block text-sm text-neutral-300">Installation ID (from the GitHub redirect)</label>
          <input id="rk-installation" value={installationId} onChange={(e) => setInstallationId(e.target.value)}
            inputMode="numeric" placeholder="e.g. 12345678" required
            className="w-56 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none" />
        </div>
        <button type="submit" disabled={busy || !installationId}
          className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-40">
          Verify & connect
        </button>
      </form>
      {message && <p role="status" className="text-sm text-neutral-300">{message}</p>}
      <p className="text-xs text-neutral-500">Link GitHub through Manage account first. You can connect your personal account or an organization you own.</p>
    </div>
  );
}
