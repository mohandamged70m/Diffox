import { NextRequest, NextResponse } from "next/server";
import { deleteSession, expiredSessionCookie, getSession, parseCookies } from "@/lib/session";
import { deleteVault } from "@/lib/vault";

export async function DELETE(req: NextRequest) {
  const id = parseCookies(req.headers.get("cookie"))["diffox_session"];
  if (id) deleteSession(id);
  deleteVault();
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", expiredSessionCookie());
  return res;
}

export async function GET(req: NextRequest) {
  const s = getSession(parseCookies(req.headers.get("cookie"))["diffox_session"]);
  if (!s) return NextResponse.json({ error: "Not configured." }, { status: 401 });
  return NextResponse.json({ ok: true });
}
