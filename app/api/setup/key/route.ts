import { NextRequest, NextResponse } from "next/server";
import { deleteSession, expiredSessionCookie, isStatelessToken, parseCookies, resolveSession } from "@/lib/session";
import { deleteVault } from "@/lib/vault";

export async function DELETE(req: NextRequest) {
  const id = parseCookies(req.headers.get("cookie"))["diffox_session"];
  if (id && !isStatelessToken(id)) deleteSession(id);
  deleteVault();
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", expiredSessionCookie());
  return res;
}

export async function GET(req: NextRequest) {
  const s = resolveSession(parseCookies(req.headers.get("cookie"))["diffox_session"]);
  if (!s) return NextResponse.json({ error: "Not configured." }, { status: 401 });
  return NextResponse.json({ ok: true });
}
