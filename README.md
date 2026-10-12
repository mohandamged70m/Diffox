# ReviewKit — CodeRabbit-style GitHub PR reviewer

Sign in → configure AI provider → install the GitHub App → open a PR → get an automatic
summary plus actionable inline comments. Pushes re-review incrementally.

Next.js 14 (App Router) · TypeScript · Tailwind · Clerk (auth) · Supabase Postgres ·
Octokit (GitHub App) · Zod · durable Postgres job queue + separate Node.js review worker.

## Status

Active build in phases (see below). The legacy single-user DiffFox file-store flow
(`app/dashboard/*`, `lib/session.ts`) is being replaced route by route; new canonical
routes are `/overview`, `/reviews`, `/repositories`, `/settings`.

## Quick start (local, no credentials required to boot)

```bash
npm install
cp .env.example .env   # fill as you go; app boots without keys and shows setup states
npm run dev            # app on http://localhost:3000
npm run worker         # separate Node.js review worker (needs Supabase + AI key)
```

## Phase plan

1. **Foundation, auth, database** — Clerk, Supabase schema (`supabase/migrations/0001_init.sql`),
   versioned AES-256-GCM crypto, new IA (`/overview`, `/reviews`, `/repositories`, `/settings`).
2. **Encrypted AI settings + GitHub installation** — save/replace/test/delete key (never returned
   to browser), installation flow with server-side authorization.
3. **Webhook, durable jobs, worker, summary reviews** — HMAC-verified webhook, Postgres queue
   with atomic claiming/leases/retries, worker publishes the summary review.
4. **Inline comments, incremental reviews, dashboard** — diff-position mapping, new-SHA-only
   reviews with fallback to full, completed dashboard pages.
5. **Tests, checks, setup documentation** — webhook/encryption/dedupe/positions/stale-SHA tests,
   GitHub App + provider setup docs, deliberate-bug end-to-end test.

## Configuration

See `.env.example` for every variable. In short:

| Area | Variables |
|---|---|
| Clerk auth | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Key encryption | `ENCRYPTION_SECRET` (passphrase, 32+ chars) |
| GitHub App | `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_SLUG` |
| AI endpoint (server-controlled) | `AI_PROVIDER_BASE_URL` (default OpenCode Zen, OpenAI-compatible) |
| Local test mode | `REVIEWKIT_LOCAL_TEST=1` (clearly-labeled simulated reviews only) |

Apply the database schema: `supabase/migrations/0001_init.sql` (via `supabase db push` or the
SQL editor). RLS is deny-by-default; all dashboard access goes through server routes that
enforce Clerk ownership per row.

## AI providers

One OpenAI-compatible provider in this MVP. The endpoint is server-controlled
(`AI_PROVIDER_BASE_URL`); each account configures its own key + model in Settings.
Repository code is sent to the configured provider for review — the Settings page says so
explicitly. No free or unlimited usage is promised: you bring your own key and model.

Details: `docs/ai-providers.md` (Phase 2). GitHub App registration: `docs/github-app.md` (Phase 2).

## Scripts

- `npm run dev` / `build` / `start` — app
- `npm run worker` — review worker (separate process; required for real reviews)
- `npm run verify` — legacy DiffFox checks (being migrated to vitest in Phase 5)
- `npm test` — vitest suite (Phase 5)
