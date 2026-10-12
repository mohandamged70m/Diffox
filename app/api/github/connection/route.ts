import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccount } from "@/lib/auth";
import { supabaseService, supabaseConfigured } from "@/lib/supabase/server";
import { githubAppConfigured, appOctokit, installationOctokit, appInstallUrl } from "@/lib/github/app";

/** Connection status: installations + repos owned by this account, plus the install URL. */
export async function GET() {
  try {
    if (!supabaseConfigured()) return NextResponse.json({ error: "Database not configured." }, { status: 501 });
    const account = await requireAccount();
    const db = supabaseService();
    const [{ data: installations }, { data: repos }] = await Promise.all([
      db.from("installations").select("installation_id, account_login, account_type, created_at").eq("account_id", account.id),
      db.from("repositories").select("id, full_name, auto_review").eq("account_id", account.id).order("full_name"),
    ]);
    return NextResponse.json({
      configured: githubAppConfigured(),
      installUrl: appInstallUrl(),
      installations: installations || [],
      repositories: repos || [],
    });
  } catch (e) {
    const status = (e as { status?: number })?.status === 401 ? 401 : 500;
    return NextResponse.json({ error: (e as Error)?.message || "Request failed." }, { status });
  }
}

const ConnectBody = z.object({ installation_id: z.coerce.number().int().positive() });

/**
 * Bind a GitHub App installation to the signed-in account.
 * The browser supplies only the installation_id from the GitHub redirect;
 * everything else (account login, repository list) is read server-side from
 * the GitHub API using the App credential — never trusted from the client.
 */
export async function POST(req: Request) {
  try {
    if (!supabaseConfigured()) return NextResponse.json({ error: "Database not configured." }, { status: 501 });
    if (!githubAppConfigured()) return NextResponse.json({ error: "GitHub App not configured server-side." }, { status: 501 });
    const account = await requireAccount();
    const body = await req.json().catch(() => null);
    const parsed = ConnectBody.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "installation_id is required." }, { status: 400 });
    const installationId = parsed.data.installation_id;

    // Verify the installation exists and read its truth from GitHub.
    const app = appOctokit();
    let installation: { account: { login: string; type: string } | null };
    try {
      const res = await app.request("GET /app/installations/{installation_id}", { installation_id: installationId });
      installation = res.data as typeof installation;
    } catch {
      return NextResponse.json({ error: "Installation not found on GitHub. Complete the App install first." }, { status: 404 });
    }
    if (!installation.account) return NextResponse.json({ error: "GitHub returned an installation without an account." }, { status: 502 });

    // List accessible repositories with the installation token (server-side truth).
    const octo = await installationOctokit(installationId);
    const repos: { id: number; full_name: string }[] = [];
    for (let page = 1; page <= 10; page++) {
      const res = await octo.request("GET /installation/repositories", { per_page: 100, page });
      for (const r of res.data.repositories) repos.push({ id: Number(r.id), full_name: r.full_name });
      if (res.data.repositories.length < 100) break;
    }

    const db = supabaseService();
    const { error: instErr } = await db.from("installations").upsert(
      {
        account_id: account.id,
        installation_id: installationId,
        account_login: installation.account.login,
        account_type: installation.account.type,
      },
      { onConflict: "account_id,installation_id" }
    );
    if (instErr) return NextResponse.json({ error: `Saving installation failed: ${instErr.message}` }, { status: 500 });

    for (const r of repos) {
      await db.from("repositories").upsert(
        {
          account_id: account.id,
          installation_id: installationId,
          github_repo_id: r.id,
          full_name: r.full_name,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id,github_repo_id" }
      );
    }
    return NextResponse.json({
      ok: true,
      installation: { installation_id: installationId, account_login: installation.account.login },
      repositories: repos.length,
    });
  } catch (e) {
    const status = (e as { status?: number })?.status === 401 ? 401 : 500;
    return NextResponse.json({ error: (e as Error)?.message || "Request failed." }, { status });
  }
}

/** Disconnect an installation (removes the binding + its repos for this account). */
export async function DELETE(req: Request) {
  try {
    if (!supabaseConfigured()) return NextResponse.json({ error: "Database not configured." }, { status: 501 });
    const account = await requireAccount();
    const body = await req.json().catch(() => null);
    const parsed = ConnectBody.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "installation_id is required." }, { status: 400 });
    const db = supabaseService();
    await db.from("repositories").delete().eq("account_id", account.id).eq("installation_id", parsed.data.installation_id);
    await db.from("installations").delete().eq("account_id", account.id).eq("installation_id", parsed.data.installation_id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = (e as { status?: number })?.status === 401 ? 401 : 500;
    return NextResponse.json({ error: (e as Error)?.message || "Request failed." }, { status });
  }
}
