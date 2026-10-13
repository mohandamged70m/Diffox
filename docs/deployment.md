# Deploy DifFox and prepare a portfolio demo

DifFox consists of a Next.js web app, Supabase Postgres, and a persistent Node.js
worker. **A Vercel web deployment alone cannot process review jobs.**

## 1. Database and authentication

1. Create a Supabase project. Run every migration in `supabase/migrations/` in
   numeric order (0001, 0002, 0003), through the SQL editor or Supabase CLI.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on web and worker.
   Never put the service-role key in a `NEXT_PUBLIC_*` variable.
3. Create a Clerk production instance, add the deployed domain, and set
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` on the web app.
   The publishable key must be present **during the web build** as well as runtime.
4. Enable Clerk's GitHub social connection. Sign in with GitHub, or link GitHub
   through Manage account. Organization owners need `read:org` OAuth scope and
   an active `admin` membership. Regular organization members cannot bind an App
   installation that can access other members' repositories.
5. Set a random `ENCRYPTION_SECRET` of at least 32 characters, identical on web
   and worker. Generate it locally with `openssl rand -hex 32`. Keep it stable:
   changing it makes saved provider keys unreadable until they are saved again.

## 2. GitHub App and AI provider

Follow [github-app.md](github-app.md). Set `GITHUB_APP_ID`,
`GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, and `GITHUB_APP_SLUG`.
Use the deployed HTTPS `/api/webhooks/github` URL and `/settings` setup URL.
Install on a test repository first. Connect from Settings after linking GitHub.
Existing connections must be reconnected after migration 0003.

Set `AI_PROVIDER_BASE_URL` identically on web and worker; save and test your own
provider key and model in Settings. The endpoint is server-controlled. Do not
invite visitors to submit keys until the deployment has passed the real review
checks below. Provider quotas/pricing depend on the provider; DifFox does not
promise unlimited or free inference.

## 3. Web and worker hosting

Use Node.js **22.12 or newer**.

- **Vercel:** deploy this repository as Next.js. Set the web variables, then
  rebuild/redeploy. Run the worker separately on a persistent Node.js/container
  host with outbound GitHub, Clerk (web), Supabase and provider access.
- **VPS/containers:** `docker compose up --build -d` starts both services from
  `.env`. Put a reverse proxy with HTTPS in front of port 3000. Compose passes
  the Clerk publishable key to the Docker build; other secrets remain runtime
  environment variables and are excluded from the Docker build context.
- **Persistent worker:** install dependencies, set worker environment variables,
  and run `npm run worker`. This loads `.env`/`.env.local` from the repository
  root for local runs; platform-injected environment values take precedence.
  Use a service manager and inspect logs/failed jobs. Start with one worker.

`DIFFOX_LOCAL_TEST` must be unset on both production services. It is only for
explicitly simulated fixtures. `.env` files must never be committed.

## 4. Release verification

- [ ] `npm ci` and `npm run verify` pass; check the GitHub Actions run too.
- [ ] Build the Docker image in CI (Docker is not available in the review workspace).
- [ ] The deployed sign-in flow completes and redirects to Overview.
- [ ] Health flags show Clerk, Supabase, GitHub App and encryption configured,
      with localTest false. `/api/health` is dynamic; it checks configuration,
      **not live database connectivity or worker liveness**.
- [ ] Apply all migrations and link the correct GitHub owner. A second unrelated
      user cannot connect that installation or read its data.
- [ ] Save/test/remove an AI key. Only the masked key appears in responses.
- [ ] Run [e2e-test.md](e2e-test.md) on a throwaway repository. Capture the actual
      GitHub review URL, dashboard details, and reviewed commit SHA.
- [ ] Push a fix and verify an incremental re-review. Confirm the worker runs
      persistently and failed jobs are visible.
- [ ] Verify signed webhook redelivery/retry, revoked access, closed/draft PRs,
      and toggling automatic reviews off.
- [ ] Capture desktop and mobile screenshots and a short demo recording.

## Portfolio entry

**Title:** DifFox — AI Pull Request Reviewer

**Description:** An AI-assisted GitHub pull request reviewer built with Next.js,
TypeScript, Clerk, and Supabase. Uses encrypted provider credentials, signed
webhooks, a durable background queue, and incremental reviews to produce
structured findings and inline feedback.

**Links:** repository, deployment, and a real example review/demo recording.
Until the real flow passes, label it **MVP / in development** and describe the
architecture and implemented features without claiming production readiness.
