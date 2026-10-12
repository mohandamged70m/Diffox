import { NextRequest, NextResponse } from "next/server";
import { getSession, parseCookies } from "@/lib/session";
import { persistentSupported } from "@/lib/vault";

export async function GET(req: NextRequest) {
  const cookies = parseCookies(req.headers.get("cookie"));
  const s = getSession(cookies["diffox_session"]);
  if (!s) {
    return NextResponse.json({ configured: false, persistentSupported: persistentSupported() });
  }
  // Never return the key — only status + masked indicator.
  return NextResponse.json({
    configured: true,
    provider: s.provider,
    baseURL: s.baseURL,
    model: s.model,
    masked: s.masked,
    remember: s.remember,
    persistentSupported: persistentSupported(),
  });
}
