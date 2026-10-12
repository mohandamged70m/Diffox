import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { getAiConfigStatus, saveAiConfig, deleteAiConfig, AI_KEY_SCHEMA, providerBaseURL } from "@/lib/ai-config";
import { classifyError } from "@/lib/providers/types";

function err(e: unknown, fallback = "Request failed.") {
  const status = (e as { status?: number })?.status;
  if (status === 401) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (status === 404) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ error: (e as Error)?.message || fallback }, { status: 500 });
}

/** AI setup status. The saved key is NEVER returned — only a masked indicator. */
export async function GET() {
  try {
    if (!supabaseConfigured()) return NextResponse.json({ error: "Database not configured." }, { status: 501 });
    const account = await requireAccount();
    const status = await getAiConfigStatus(account.id);
    return NextResponse.json({
      ...status,
      providerEndpoint: providerBaseURL(),
      encryptionReady: (process.env.ENCRYPTION_SECRET || "").length >= 32,
    });
  } catch (e) {
    return err(e);
  }
}

/** Save (or replace) the AI key. Probes the provider first; nothing is stored until it succeeds. */
export async function POST(req: Request) {
  try {
    if (!supabaseConfigured()) return NextResponse.json({ error: "Database not configured." }, { status: 501 });
    if ((process.env.ENCRYPTION_SECRET || "").length < 32) {
      return NextResponse.json(
        { error: "ENCRYPTION_SECRET (32+ chars) must be set server-side before keys can be saved." },
        { status: 501 }
      );
    }
    const account = await requireAccount();
    const body = await req.json().catch(() => null);
    const parsed = AI_KEY_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Provide a model and an API key (min 8 chars)." }, { status: 400 });
    }
    try {
      const saved = await saveAiConfig(account.id, parsed.data);
      return NextResponse.json({ ok: true, model: saved.model, modelFound: saved.modelFound });
    } catch (e) {
      const c = classifyError(e);
      return NextResponse.json({ error: c.message }, { status: c.kind === "auth" ? 401 : c.kind === "model" ? 404 : 502 });
    }
  } catch (e) {
    return err(e);
  }
}

/** Delete the saved key. */
export async function DELETE() {
  try {
    if (!supabaseConfigured()) return NextResponse.json({ error: "Database not configured." }, { status: 501 });
    const account = await requireAccount();
    await deleteAiConfig(account.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return err(e);
  }
}
