import { auth } from "@clerk/nextjs/server";
import { supabaseService } from "./supabase/server";

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
export { assertOwns } from "./ownership";
