# DifFox — AI pull request reviewer

Sign in → configure AI provider → install the GitHub App → open a PR → get an automatic
summary plus actionable inline comments. Pushes re-review incrementally.

Next.js 15 (App Router) · TypeScript · Tailwind · Clerk (auth) · Supabase Postgres ·
Octokit (GitHub App) · Zod · durable Postgres job queue + separate Node.js review worker.

## Quick start

```bash
npm ci
cp .env.example .env   # fill as you go; the app boots without keys and shows setup states
npm run dev            # app on http://localhost:3000
```

Apply all SQL files in `supabase/migrations/` in numeric order before first use via
`supabase db push` or the Supabase SQL editor. RLS is deny-by-default; all dashboard
access goes through server routes that enforce Clerk ownership per row.

## Running the review worker

Real reviews require the worker — a **separate Node.js process** (never Vercel serverless):

```bash
npm run worker   # polls review_jobs every WORKER_POLL_MS (default 5000)
```

Use Node.js 22.12 or newer. The worker loads `.env`/`.env.local` from the project
root, just like Next.js. Deployment environment variables take precedence.

The worker needs `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`ENCRYPTION_SECRET`, the GitHub App variables, and an `AI_PROVIDER_BASE_URL`.
It claims jobs atomically (conditional UPDATE on status/lease, so multiple workers
do not claim the same unexpired lease), holds a 10-minute lease, retries with bounded attempts (4),
and reclaims stale leases after a crash. Failed jobs surface in Reviews with their
error; retries reconcile already-posted GitHub reviews via a hidden marker to
reduce duplicate feedback. The worker renews active leases during long reviews.

Deploy as two processes sharing env: e.g. `npm start` + `npm run worker` on a VPS,
or two services sharing a database (see `docker-compose.yml`).

## Local test mode (simulated, clearly labeled)

Without GitHub, exercise the real pipeline end-to-end:

```bash
DIFFOX_LOCAL_TEST=1 npm run worker   # in one terminal
# in another: npm run dev, sign in, save an AI key (or skip it for a canned result)
curl -X POST http://localhost:3000/api/test/local-review \
  -H 'Content-Type: application/json' \
  -H "Cookie: <your session cookie>" \
  -d '{"repo_full_name":"local/demo","pr_number":1,"head_sha":"abc1234","diff":"...unified diff..."}'
```

The worker runs the model pipeline on the fixture (or a canned result with no key)
and persists findings. Every simulated summary starts with
`[SIMULATED — local test mode, not a real GitHub review]`. **Never present simulated
reviews as real GitHub results.** Set `DIFFOX_LOCAL_TEST=1` for **both** the web app and worker. The endpoint
404s unless this flag is enabled. Keep it disabled for real deployments.

A deliberate-bug fixture for end-to-end testing lives in `docs/e2e-test.md`.

## Configuration

See `.env.example` for every variable:

| Area | Variables |
|---|---|
| Clerk auth | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Key encryption | `ENCRYPTION_SECRET` (passphrase, 32+ chars) |
| GitHub App | `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_SLUG` |
| AI endpoint (server-controlled) | `AI_PROVIDER_BASE_URL` (default OpenCode Zen, OpenAI-compatible) |
| Local test mode | `DIFFOX_LOCAL_TEST=1` (simulated reviews only) |

Setup guides: `docs/ai-providers.md`, `docs/github-app.md`, `docs/e2e-test.md` (Phase 5).

## Scripts

- `npm run dev` / `build` / `start` — app
- `npm run worker` — review worker (separate process; required for real reviews)
- `npm test` — Vitest regression suite
- `npm run typecheck` — TypeScript checks
- `npm run verify` — TypeScript + tests + production build

Deployment and portfolio release checklist: [docs/deployment.md](docs/deployment.md).
Readiness findings and scope: [docs/portfolio-readiness.md](docs/portfolio-readiness.md).
