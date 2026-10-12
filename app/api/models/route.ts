import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { listModels } from "@/lib/providers/openai-compatible";
import { classifyError } from "@/lib/providers/types";

/** Server-side model listing — key never leaves the server. */
export async function GET(req: NextRequest) {
  const { error, session } = requireSession(req);
  if (error || !session) return error;
  try {
    const models = await listModels({ baseURL: session.baseURL, apiKey: session.apiKey, model: session.model });
    return NextResponse.json({ models });
  } catch (e) {
    const c = classifyError(e);
    return NextResponse.json({ error: c.message }, { status: c.status ?? 502 });
  }
}
