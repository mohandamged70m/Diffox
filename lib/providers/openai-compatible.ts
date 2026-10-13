import { ChatMessage, ProviderConfig, normalizeBaseURL, providerError } from "./types";

async function req(url: string, apiKey: string, init: RequestInit, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, ...(init.headers || {}) },
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/** GET {base}/models — OpenAI-compatible model list. */
export async function listModels(cfg: ProviderConfig): Promise<string[]> {
  const base = normalizeBaseURL(cfg.baseURL);
  const res = await req(`${base}/models`, cfg.apiKey, { method: "GET" });
  if (!res.ok) {
    throw providerError(res.status, `Models request failed (${res.status}).`);
  }
  const json = (await res.json()) as { data?: { id: string }[] };
  return (json.data || []).map((m) => m.id).filter(Boolean);
}

/** Minimal credential+model check: GET /models then a tiny chat completion. */
export async function testConnection(cfg: ProviderConfig): Promise<{ models: string[]; modelFound: boolean }> {
  const base = normalizeBaseURL(cfg.baseURL);
  let models: string[] = [];
  try {
    models = await listModels(cfg);
  } catch (e: unknown) {
    // Some gateways disable /models; fall through to chat probe so we don't
    // reject valid credentials. Chat failure below still classifies correctly.
    const err = e as { status?: number };
    if (err?.status === 401 || err?.status === 403) throw e;
    models = [];
  }
  const res = await req(
    `${base}/chat/completions`,
    cfg.apiKey,
    {
      method: "POST",
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 8,
        temperature: 0,
        messages: [{ role: "user", content: "Reply with exactly: ok" } satisfies ChatMessage],
      }),
    },
    45000
  );
  if (!res.ok) {
    throw providerError(res.status, `Chat probe failed (${res.status}).`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  if (!json.choices) throw providerError(502, "Malformed provider response: missing choices array.");
  return { models, modelFound: models.length === 0 ? true : models.includes(cfg.model) };
}

/** Full chat completion used by the review worker. */
export async function chatCompletion(cfg: ProviderConfig, messages: ChatMessage[], opts?: { maxTokens?: number; temperature?: number; timeoutMs?: number }): Promise<string> {
  const base = normalizeBaseURL(cfg.baseURL);
  const res = await req(
    `${base}/chat/completions`,
    cfg.apiKey,
    {
      method: "POST",
      body: JSON.stringify({
        model: cfg.model,
        temperature: opts?.temperature ?? 0.2,
        max_tokens: opts?.maxTokens ?? 4000,
        messages,
      }),
    },
    opts?.timeoutMs ?? 120000
  );
  if (!res.ok) {
    // Providers may echo credentials or private prompts in error bodies.
    throw providerError(res.status, `Chat completion failed (${res.status}).`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw providerError(502, "Malformed provider response: empty content.");
  return content;
}

export async function withBackoff<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      last = e;
      const st = (e as { status?: number })?.status;
      const retryable = st === 429 || (typeof st === "number" && st >= 500);
      if (!retryable || attempt === maxAttempts) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw last;
}
