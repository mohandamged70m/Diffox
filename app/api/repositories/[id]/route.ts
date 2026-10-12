import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccount } from "@/lib/auth";
import { supabaseService, supabaseConfigured } from "@/lib/supabase/server";
import { splitExcluded } from "@/lib/review/filter";

function err(e: unknown) {
  const status = (e as { status?: number })?.status;
  if (status === 401) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (status === 404) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ error: (e as Error)?.message || "Request failed." }, { status: 500 });
}

/** Repositories owned by this account. */
export async function GET() {
  try {
    if (!supabaseConfigured()) return NextResponse.json({ error: "Database not configured." }, { status: 501 });
    const account = await requireAccount();
    const db = supabaseService();
    const { data, error } = await db
      .from("repositories")
      .select("id, full_name, auto_review, excluded_paths, installation_id, updated_at")
      .eq("account_id", account.id)
      .order("full_name");
    if (error) throw new Error(error.message);
    return NextResponse.json({ repositories: data || [] });
  } catch (e) {
    return err(e);
  }
}

const PatchBody = z.object({
  auto_review: z.boolean().optional(),
  excluded_paths: z.union([z.string(), z.array(z.string()).max(50)]).optional(),
});

/** Toggle automatic review or update excluded paths (account-owned rows only). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    if (!supabaseConfigured()) return NextResponse.json({ error: "Database not configured." }, { status: 501 });
    const account = await requireAccount();
    const body = await req.json().catch(() => null);
    const parsed = PatchBody.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid body." }, { status: 400 });
    const db = supabaseService();
    const { data: existing, error: findErr } = await db
      .from("repositories")
      .select("id, account_id")
      .eq("id", params.id)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);
    if (!existing || existing.account_id !== account.id) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.auto_review !== undefined) patch.auto_review = parsed.data.auto_review;
    if (parsed.data.excluded_paths !== undefined) {
      patch.excluded_paths =
        typeof parsed.data.excluded_paths === "string"
          ? splitExcluded(parsed.data.excluded_paths)
          : parsed.data.excluded_paths.map((s) => s.trim()).filter(Boolean).slice(0, 50);
    }
    const { data, error } = await db
      .from("repositories")
      .update(patch)
      .eq("id", params.id)
      .select("id, full_name, auto_review, excluded_paths")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ repository: data });
  } catch (e) {
    return err(e);
  }
}
