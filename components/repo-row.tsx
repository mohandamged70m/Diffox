"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RepoRow({ repo }: {
  repo: { id: string; full_name: string; auto_review: boolean; excluded_paths: string[] };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [excluded, setExcluded] = useState((repo.excluded_paths || []).join("\n"));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/repositories/${repo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed.");
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm">{repo.full_name}</span>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox" checked={repo.auto_review} disabled={busy}
            onChange={(e) => patch({ auto_review: e.target.checked })}
            className="h-4 w-4 accent-neutral-100"
          />
          Automatic review
        </label>
      </div>
      <div>
        <label htmlFor={`ex-${repo.id}`} className="mb-1 block text-xs text-neutral-500">
          Excluded paths (one per line — exact paths, directory prefixes, or globs like *.md)
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <textarea
            id={`ex-${repo.id}`} value={excluded} onChange={(e) => setExcluded(e.target.value)} rows={2}
            placeholder={"docs/\n*.md"}
            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-[13px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-500 focus:outline-none"
          />
          <button onClick={() => patch({ excluded_paths: excluded })} disabled={busy}
            className="shrink-0 rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-40">
            Save
          </button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {saved && <p role="status" className="text-sm text-emerald-300">Saved.</p>}
    </li>
  );
}
