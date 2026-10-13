# GitHub App registration

DifFox reviews PRs through a **GitHub App** you own. The app needs only three
permissions and subscribes to three events.

## 1. Create the App

1. On GitHub: **Settings → Developer settings → GitHub Apps → New GitHub App**.
2. **GitHub App name:** e.g. `diffox-<yourname>` (must be globally unique).
3. **Homepage URL:** your deployment URL, e.g. `https://diffox.example.com`.
4. **Webhook URL:** `https://<your-host>/api/webhooks/github` (must be public HTTPS).
5. **Webhook secret:** generate a strong random value (`openssl rand -hex 32`) — this becomes `GITHUB_WEBHOOK_SECRET`.
6. **Setup URL (optional but recommended):** `https://<your-host>/settings` — GitHub redirects here with `installation_id` after install, and the Settings page picks it up for one-click connect.
6. Permissions:
   - **Contents:** Read-only (fetch PR diffs and surrounding code)
   - **Pull requests:** Read & write (read PR metadata, post review comments)
   - **Metadata:** Read-only (mandatory)
7. **Subscribe to events:** `Pull request`, `Installation`, `Installation repositories`.
8. **Where can this GitHub App be installed:** leave as “Only on this account” unless you plan to list it publicly.
9. Create, then note the **App ID** → `GITHUB_APP_ID`, and the **slug** in the URL (`/apps/<slug>`) → `GITHUB_APP_SLUG`.
10. **Generate a private key** (bottom of the App page) → `GITHUB_APP_PRIVATE_KEY`
    (paste the PEM, multiline or base64-encoded single line).

## 2. Configure DifFox

```bash
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_WEBHOOK_SECRET=<secret from step 5>
GITHUB_APP_SLUG=diffox-yourname
```

Restart the app + worker.

## 3. Enable verified GitHub identity

Enable the GitHub social connection in Clerk. Users must link their GitHub account
through the Clerk Manage account screen or sign in using GitHub. DifFox fetches
that user's OAuth token server-side and verifies personal installation ownership
using `GET /user`. Organization installations require an **active organization
owner** (`admin` role) verified through `GET /user/memberships/orgs/{org}`; configure
`read:org` in your Clerk GitHub OAuth scopes and reauthorize the connection.
A regular organization member cannot connect all installation repositories.
Missing, revoked, or insufficient OAuth access fails closed with HTTP 403.

Apply `0003_installation_verification.sql`. Existing installations must be
reconnected; until then, webhooks and workers ignore them. Only an App installation
ID from a redirect is insufficient proof of ownership.

## 4. Install on repositories

1. Sign in to DifFox → **Settings → GitHub connection → Install GitHub App**.
2. Choose **Only select repositories** and pick the repos to review.
3. GitHub redirects back with an `installation_id`; paste it into **Verify & connect**.
   The server verifies your linked GitHub identity owns the installation before
   reading its repositories and saving the connection.
4. Manage per-repo **automatic-review toggles and excluded paths** in **Repositories**.

## 5. Webhook behavior

- The endpoint verifies `X-Hub-Signature-256` against the raw body, deduplicates by
  `X-GitHub-Delivery`, handles `pull_request` (`opened`, `synchronize`, `ready_for_review`)
  plus `installation` / `installation_repositories` sync, then enqueues a durable job
  and returns — the AI review always happens in the worker, never in the webhook request.
- Skipped without error: drafts, closed/merged PRs, repos with auto-review off,
  accounts without AI setup.
- Removing the installation or a repository on GitHub is synced on the next
  `installation` / `installation_repositories` event; you can also disconnect from Settings.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| No reviews posted | Webhook URL not public / secret mismatch | Check delivery log on the App page; compare secrets |
| “Installation not found” on connect | Install step skipped | Install the App on the account first, then connect |
| Reviews skipped | AI key missing or repo auto-review off | Settings → AI credentials; Repositories → toggle |
