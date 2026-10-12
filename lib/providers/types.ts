export interface ChatMessage { role: "system" | "user" | "assistant"; content: string; }

export interface ProviderConfig { baseURL: string; apiKey: string; model: string; }

export interface ProviderError extends Error { status?: number; code?: string; }

export function normalizeBaseURL(raw: string): string {
  return (raw || "").trim().replace(/\/+$/, "");
}

/**
 * Provider-specific model ID cleanup. Google's OpenAI-compat layer expects bare
 * IDs (gemini-2.5-flash) and rejects native resource names (models/gemini-2.5-flash)
 * with "unexpected model name format", so strip that prefix for google-aistudio.
 */
export function normalizeModelId(provider: string, model: string): string {
  let m = (model || "").trim();
  if (provider === "google-aistudio") {
    m = m.replace(/^models\//i, "");
  }
  return m;
}

export function providerError(status: number, message: string, code?: string): ProviderError {
  const e = new Error(message) as ProviderError;
  e.status = status;
  e.code = code;
  return e;
}

export function classifyError(e: unknown): { kind: "auth" | "model" | "ratelimit" | "network" | "server" | "badresponse"; message: string; status?: number } {
  const err = e as ProviderError & { cause?: unknown };
  const status = err?.status;
  const msg = (err?.message || "Connection failed").slice(0, 500);
  if (status === 401 || status === 403) return { kind: "auth", message: "Invalid credentials (401/403). Check your API key.", status };
  if (status === 404) return { kind: "model", message: "Model or endpoint not found (404). Check base URL and model ID.", status };
  if (status === 429) return { kind: "ratelimit", message: "Rate limited (429). Wait and retry.", status };
  if (status && status >= 500) return { kind: "server", message: `Provider error (${status}). Retry later.`, status };
  if (/fetch failed|ECONN|ENOTFOUND|network|timeout/i.test(msg)) return { kind: "network", message: "Connection failed. Check base URL and network." };
  return { kind: "badresponse", message: msg, status };
}
