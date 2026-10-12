"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Input, Label } from "@/components/ui/primitives";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const ZEN_DEFAULT = "https://opencode.ai/zen/v1";
const GOOGLE_DEFAULT = "https://generativelanguage.googleapis.com/v1beta/openai";

export function SetupForm() {
  const router = useRouter();
  const [provider, setProvider] = useState("opencode-zen");
  const [baseURL, setBaseURL] = useState(ZEN_DEFAULT);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [remember, setRemember] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [persistent, setPersistent] = useState(false);

  useEffect(() => {
    fetch("/api/setup/status").then(async (r) => {
      const j = await r.json().catch(() => ({}));
      setPersistent(Boolean(j.persistentSupported));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (provider === "opencode-zen") setBaseURL(ZEN_DEFAULT);
    else if (provider === "google-aistudio") setBaseURL(GOOGLE_DEFAULT);
    else if (provider === "openai") setBaseURL("https://api.openai.com/v1");
    else if (provider === "custom" && (baseURL === ZEN_DEFAULT || baseURL === GOOGLE_DEFAULT)) setBaseURL("");
  }, [provider]); // eslint-disable-line

  async function test() {
    setBusy(true); setError(null); setModels([]);
    try {
      const res = await fetch("/api/setup/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, baseURL, apiKey, model, remember }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Connection failed.");
        return;
      }
      if (Array.isArray(j.models)) setModels(j.models);
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Connection failed. Check the base URL and your network.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 rounded-lg border border-neutral-800 bg-neutral-900/60 p-6">
      <div className="grid gap-5">
        <div>
          <Label htmlFor="provider">Provider</Label>
          <select id="provider" value={provider} onChange={(e) => setProvider(e.target.value)}
            className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm focus-ring">
            <option value="opencode-zen">OpenCode Zen (Recommended)</option>
            <option value="google-aistudio">Google AI Studio (Gemini)</option>
            <option value="openai">OpenAI</option>
            <option value="custom">Other OpenAI-compatible</option>
          </select>
        </div>
        <div>
          <Label htmlFor="base">Base URL</Label>
          <Input id="base" value={baseURL} onChange={(e) => setBaseURL(e.target.value)}
            placeholder="https://opencode.ai/zen/v1" inputMode="url" autoComplete="off"
            disabled={provider === "opencode-zen" || provider === "google-aistudio"} />
          {(provider === "opencode-zen" || provider === "google-aistudio") && (
            <p className="mt-1 text-xs text-neutral-500">
              {provider === "google-aistudio"
                ? "Fixed to Google's documented OpenAI-compat endpoint. Use a Gemini API key from AI Studio."
                : "Fixed to the documented Zen endpoint."}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="key">API key</Label>
          <div className="relative">
            <Input id="key" type={show ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === "google-aistudio" ? "AIza… (AI Studio API key)" : "sk-…"} autoComplete="off" className="pr-10" />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide key" : "Show key"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:text-neutral-100">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div>
          <Label htmlFor="model">Model ID</Label>
          <Input id="model" value={model} onChange={(e) => setModel(e.target.value)}
            placeholder={provider === "google-aistudio" ? "e.g. gemini-2.5-flash (no models/ prefix)" : "e.g. your-model-id"} autoComplete="off" list="diffox-models" />
          <datalist id="diffox-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
          <p className="mt-1 text-xs text-neutral-500">No model is assumed. Use “Test connection” to confirm your key can access this model.</p>
        </div>
        <label className="flex items-start gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={remember} disabled={!persistent} onChange={(e) => setRemember(e.target.checked)} className="mt-1" />
          <span>Remember my key (encrypted server-side, 30 days)
            {!persistent && <span className="block text-xs text-neutral-500">Disabled: ENCRYPTION_SECRET is not configured. Session-only mode.</span>}
          </span>
        </label>
        {error && <Alert kind="error">{error}</Alert>}
        <Button onClick={test} disabled={busy || !apiKey.trim() || !model.trim() || !baseURL.trim()}>
          {busy && <Loader2 size={16} className="animate-spin" />}Test connection
        </Button>
        <p className="text-xs text-neutral-500">Session-only by default: closing the browser clears the key from the server session on next restart. You enter the dashboard only after a successful test.</p>
      </div>
    </div>
  );
}
