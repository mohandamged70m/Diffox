import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, maskKey, sessionCookieName, OWNER_ID } from "@/lib/session";
import { normalizeBaseURL, classifyError } from "@/lib/providers/types";
import { testConnection } from "@/lib/providers/openai-compatible";
import { persistentSupported, saveVault } from "@/lib/vault";

const Body = z.object({
  provider: z.enum(["opencode-zen", "openai", "custom"]).default("opencode-zen"),
  baseURL: z.string().min(8).max(500),
  apiKey: z.string().min(4).max(500),
  model: z.string().min(1).max(200),
  remember: z.boolean().optional().default(false),
});

const PROVIDER_DEFAULTS: Record<string, string> = {
  "opencode-zen": "https://opencode.ai/zen/v1",
  openai: "https://api.openai.com/v1",
};

/**
 * Validates credentials server-side and, only on success, creates an
 * owner session (HttpOnly cookie). Invalid credentials never create a session.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing or invalid fields (baseURL, apiKey, model required)." }, { status: 400 });
  }
  const { provider, apiKey, model, remember } = parsed.data;
  let baseURL = normalizeBaseURL(parsed.data.baseURL);
  if (!baseURL) baseURL = PROVIDER_DEFAULTS[provider] || "";
  try {
    new URL(baseURL);
  } catch {
    return NextResponse.json({ error: "Invalid base URL." }, { status: 400 });
  }

  if (remember && !persistentSupported()) {
    return NextResponse.json({ error: "“Remember my key” is disabled: ENCRYPTION_SECRET is not configured on the server." }, { status: 400 });
  }

  try {
    const { models } = await testConnection({ baseURL, apiKey, model });
    if (models.length > 0 && !models.includes(model)) {
      return NextResponse.json(
        { error: `Model “${model}” was not found for this key. Available examples: ${models.slice(0, 8).join(", ")}${models.length > 8 ? "…" : ""}. Nothing was saved.` },
        { status: 404 }
      );
    }
    const session = createSession({
      ownerId: OWNER_ID, provider, baseURL, model, apiKey, masked: maskKey(apiKey), remember,
    });
    if (remember) {
      const { encryptString } = await import("@/lib/vault");
      saveVault({ provider, baseURL, model, payload: encryptString(apiKey) });
    }
    const res = NextResponse.json({ ok: true, masked: session.masked, models: models.slice(0, 50), provider, baseURL, model });
    const attrs = [`${sessionCookieName}=${encodeURIComponent(session.id)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
    if (process.env.NODE_ENV === "production") attrs.push("Secure");
    if (remember) attrs.push(`Max-Age=${60 * 60 * 24 * 30}`);
    res.headers.set("Set-Cookie", attrs.join("; "));
    return res;
  } catch (e) {
    const c = classifyError(e);
    const status = c.status ?? (c.kind === "auth" ? 401 : c.kind === "ratelimit" ? 429 : 502);
    // Never include the key in the response or logs.
    return NextResponse.json({ error: c.message, kind: c.kind }, { status });
  }
}
