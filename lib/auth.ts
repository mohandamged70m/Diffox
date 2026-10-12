import { NextRequest, NextResponse } from "next/server";
import { resolveSession, parseCookies } from "./session";

export function requireSession(req: NextRequest) {
  const cookies = parseCookies(req.headers.get("cookie"));
  const session = resolveSession(cookies["diffox_session"]);
  if (!session) {
    return { error: NextResponse.json({ error: "Not configured. Complete AI setup first." }, { status: 401 }) as NextResponse, session: null as null };
  }
  return { error: null as null, session };
}
