"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Card, Input, Label, Textarea } from "@/components/ui/primitives";
import { Eye, EyeOff, Loader2 } from "lucide-react";

interface Status {
  configured: boolean; provider?: string; baseURL?: string; model?: string;
  masked?: string; remember?: boolean; persistentSupported?: boolean;
}

export function SettingsClient() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [provider, setProvider] = useState("opencode-zen");
  const [baseURL, setBaseURL] = useState("https://opencode.ai/zen/v1");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [remember, setRemember] = useState(false);
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState("");
  const [instr, setInstr] = useState("");

  async function load() {
    const s = await fetch("/api/setup/status").then((r) => r.json());
    setStatus(s);
    if (s.configured) {
      setProvider(s.provider || "opencode-zen");
      setBaseURL(s.baseURL || "");
      setModel(s.model || "");
      setRemember(Boolean(s.remember));
    }
    const st = await fetch("/api/settings").then((r) => r.json()).catch(() => null);
    if (st?.settings) { setPrefs(st.settings.reviewPreferences || ""); setInstr(st.settings.projectInstructions || ""); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/setup/test", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, baseURL, apiKey, model, remember }),
      });
      const j = await res.json();
      if (!res.ok) { setMsg({ kind: "error", text: j.error || "Save failed." }); return; }
      setApiKey("");
      setMsg({ kind: "ok", text: `Connection verified. Key ${j.masked} active.` });
      load();
    } catch { setMsg({ kind: "error", text: "Save failed (network)." }); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm("Delete the saved key? Active sessions will be signed out.")) return;
    await fetch("/api/setup/key", { method: "DELETE" });
    setApiKey(""); setStatus(null);
    router.push("/setup");
  }

  async function savePrefs() {
    const res = await fetch("/api/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewPreferences: prefs, projectInstructions: instr }),
    });
    setMsg(res.ok ? { kind: "ok", text: "Preferences saved." } : { kind: "error", text: "Save failed." });
  }

  return (
    <div className="grid gap-6">
      <Card className="p-5">
        <h2 className="text-sm font-medium">Provider & credentials</h2>
        {status?.configured && (
          <p className="mt-1 text-xs text-neutral-500">Active: {status.provider} · <span className="font-mono">{status.baseURL}</span> · model <span className="font-mono">{status.model}</span> · key <span className="font-mono">{status.masked}</span></p>
        )}
        <div className="mt-4 grid gap-4">
          <div>
            <Label htmlFor="sp">Provider</Label>
            <select id="sp" value={provider} onChange={(e) => setProvider(e.target.value)} className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm">
              <option value="opencode-zen">OpenCode Zen</option>
              <option value="openai">OpenAI</option>
              <option value="custom">Other OpenAI-compatible</option>
            </select>
          </div>
          <div><Label htmlFor="sb">Base URL</Label><Input id="sb" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} /></div>
          <div>
            <Label htmlFor="sk">New API key (leave blank to keep current)</Label>
            <div className="relative">
              <Input id="sk" type={show ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" autoComplete="off" className="pr-10" />
              <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide" : "Show"} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </div>
          <div><Label htmlFor="sm">Model ID</Label><Input id="sm" value={model} onChange={(e) => setModel(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" checked={remember} disabled={!status?.persistentSupported} onChange={(e) => setRemember(e.target.checked)} />
            Remember my key {!status?.persistentSupported && <span className="text-xs text-neutral-500">(disabled — ENCRYPTION_SECRET missing)</span>}
          </label>
          {msg && <Alert kind={msg.kind === "ok" ? "ok" : msg.kind === "info" ? "info" : "error"}>{msg.text}</Alert>}
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy || (!apiKey.trim() && !status?.configured) || !model.trim() || !baseURL.trim()}>
              {busy && <Loader2 size={16} className="animate-spin" />}Verify & save
            </Button>
            <Button variant="danger" onClick={remove}>Delete key</Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-medium">Review preferences</h2>
        <div className="mt-3 grid gap-3">
          <div><Label htmlFor="prefs">Default review focus</Label><Textarea id="prefs" rows={3} value={prefs} onChange={(e) => setPrefs(e.target.value)} /></div>
          <div><Label htmlFor="pinstr">Project instructions</Label><Textarea id="pinstr" rows={4} value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="Repo conventions, frameworks, things to ignore…" /></div>
          <div><Button variant="outline" onClick={savePrefs}>Save preferences</Button></div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-medium">GitHub connection</h2>
        <p className="mt-2 text-sm text-neutral-400">GitHub integration not configured. Automatic PR reviews require a GitHub App (client ID, installation, webhook secret) — not yet implemented.</p>
      </Card>
    </div>
  );
}
