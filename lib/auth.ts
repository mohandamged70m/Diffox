import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "./supabase/server";
import { resolveSession, parseCookies } from "./session";

export interface Account {
  id: string;
  clerk_user_id: string;
}
/**
 * Resolve the signed-in Clerk user to a ReviewKit account row.
 * Creates the row on first sign-in. Throws 401 when signed out.
 */
export async function requireAccount(): Promise<Account> {
  const { userId } = await auth();
  if (!userId) {
    const err = new Error("Sign in required.") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  const db = supabaseService();
  const { data, error } = await db
    .from("accounts")
    .upsert({ clerk_user_id: userId }, { onConflict: "clerk_user_id" })
    .select("id, clerk_user_id")
    .single();
  if (error || !data) throw new Error(`Account lookup failed: ${error?.message || "unknown"}`);
  return data as Account;
}

/** Scope check: does this account own the row's account_id? */
export function assertOwns(accountId: string, rowAccountId: string) {
  if (accountId !== rowAccountId) {
    const err = new Error("Not found.") as Error & { status?: number };
    err.status = 404; // deliberately 404 to avoid leaking cross-account existence
    throw err;
  }
}

/**
 * Legacy DiffFox cookie-session helper (kept until the old /dashboard routes are
 * removed in Phase 4). New code uses Clerk + requireAccount().
 */
export function requireSession(req: NextRequest) {
  const cookies = parseCookies(req.headers.get("cookie"));
  const session = resolveSession(cookies["diffox_session"]);
  if (!session) {
    return { error: NextResponse.json({ error: "Not configured. Complete AI setup first." }, { status: 401 }) as NextResponse, session: null as null };
  }
  return { error: null as null, session };
}
