import { requireAccount } from "@/lib/auth";
import { supabaseService, supabaseConfigured } from "@/lib/supabase/server";
import { getAiConfigStatus, providerBaseURL } from "@/lib/ai-config";
import { githubAppConfigured, appInstallUrl } from "@/lib/github/app";
import { configuredFlags } from "@/lib/env";
import { AiKeyForm } from "@/components/ai-key-form";
import { GitHubConnect } from "@/components/github-connect";

export const dynamic = "force-dynamic";

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-5">
      <h2 className="text-base font-medium">{title}</h2>
      <p className="mb-4 mt-1 text-sm text-neutral-400">{desc}</p>
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  const flags = configuredFlags();
  if (!flags.supabase || !flags.clerk) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Connect Clerk and Supabase first (see README), then AI and GitHub settings appear here.
        </p>
      </div>
    );
  }
  const account = await requireAccount();
  const db = supabaseService();
  const [ai, { data: installations }] = await Promise.all([
    getAiConfigStatus(account.id),
    db.from("installations").select("installation_id, account_login").eq("account_id", account.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-neutral-400">AI credentials, model, GitHub connection, and configuration status.</p>
      </div>

      {!ai.configured && (
        <div role="alert" className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
          <strong>Setup required:</strong> save an AI key below before automatic reviews can run. PRs received without AI setup are skipped, not queued silently.
        </div>
      )}

      <Section title="AI credentials" desc="One OpenAI-compatible provider. The endpoint is controlled by the server, not the browser.">
        <dl className="mb-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div><dt className="text-neutral-500">Status</dt><dd>{ai.configured ? `${ai.keyMasked} (${ai.status})` : "Not configured"}</dd></div>
          <div><dt className="text-neutral-500">Model</dt><dd className="font-mono text-[13px]">{ai.model || "—"}</dd></div>
          <div><dt className="text-neutral-500">Provider</dt><dd className="font-mono text-[13px]">{ai.provider || "openai-compatible"}</dd></div>
          <div><dt className="text-neutral-500">Last tested</dt><dd>{ai.lastTestedAt ? new Date(ai.lastTestedAt).toLocaleString() : "—"}</dd></div>
        </dl>
        {ai.lastError && <p className="mb-4 text-sm text-red-300">{ai.lastError}</p>}
        <AiKeyForm hasKey={ai.configured} encryptionReady={flags.encryption} providerEndpoint={providerBaseURL()} />
      </Section>

      <Section title="GitHub connection" desc="Install the DifFox GitHub App on selected repositories (Contents: read, Pull requests: read & write, Metadata: read).">
        {installations?.length ? (
          <ul className="mb-4 space-y-1 text-sm">
            {installations.map((i) => (
              <li key={i.installation_id} className="flex items-center justify-between rounded-md border border-neutral-800 px-3 py-2">
                <span><span className="font-medium">{i.account_login}</span> <span className="font-mono text-xs text-neutral-500">#{i.installation_id}</span></span>
                <span className="text-xs text-emerald-300">connected</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-neutral-500">No installations connected yet.</p>
        )}
        <GitHubConnect installUrl={appInstallUrl()} appConfigured={githubAppConfigured()} />
      </Section>

      <Section title="Configuration status" desc="What is ready and what still needs setup.">
        <ul className="space-y-1 text-sm">
          {[
            ["Authentication (Clerk)", flags.clerk],
            ["Database (Supabase)", flags.supabase],
            ["Key encryption (ENCRYPTION_SECRET)", flags.encryption],
            ["AI key saved", ai.configured],
            ["GitHub App credentials", githubAppConfigured()],
            ["Installation connected", Boolean(installations?.length)],
          ].map(([label, ok]) => (
            <li key={label as string} className="flex items-center gap-2">
              <span aria-hidden className={ok ? "text-emerald-400" : "text-neutral-600"}>{ok ? "●" : "○"}</span>
              <span className={ok ? "text-neutral-200" : "text-neutral-500"}>{label}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
