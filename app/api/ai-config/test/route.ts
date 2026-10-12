import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { getAiConfig } from "@/lib/ai-config";
import { testConnection } from "@/lib/providers/openai-compatible";
import { classifyError } from "@/lib/providers/types";
import { providerBaseURL, markAiConfigStatus } from "@/lib/ai-config";

/** Re-probe the saved key against the provider (key itself never leaves the server). */
export async function POST() {
  try {
    if (!supabaseConfigured()) return NextResponse.json({ error: "Database not configured." }, { status: 501 });
    const account = await requireAccount();
    const cfg = await getAiConfig(account.id);
    if (!cfg) return NextResponse.json({ error: "No AI key saved. Save a key first." }, { status: 404 });
    try {
      const probe = await testConnection({ baseURL: providerBaseURL(), apiKey: cfg.apiKey, model: cfg.model });
      await markAiConfigStatus(account.id, "active", null);
      return NextResponse.json({ ok: true, model: cfg.model, modelFound: probe.modelFound });
    } catch (e) {
      const c = classifyError(e);
      await markAiConfigStatus(account.id, c.kind === "auth" || c.kind === "model" ? "invalid" : "error", c.message);
      return NextResponse.json({ error: c.message }, { status: 502 });
    }
  } catch (e) {
    const status = (e as { status?: number })?.status === 401 ? 401 : 500;
    return NextResponse.json({ error: (e as Error)?.message || "Request failed." }, { status });
  }
}
