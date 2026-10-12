# DiffFox — personal AI code-review dashboard

Manual code reviews first (paste a diff or snippet), GitHub automation later.
Next.js 14 · TypeScript · Tailwind CSS · shadcn-style UI · OpenAI-compatible provider (default: OpenCode Zen).

## Quick start

```bash
npm install
cp .env.example .env   # then fill ENCRYPTION_SECRET if you want "Remember my key"
npm run dev            # app on http://localhost:3000
npm run worker         # separate Node.js worker that processes review jobs
```

Open the app → you see **AI setup first**. Enter provider, base URL, key, model ID →
**Test connection** → dashboard unlocks only on success.

## Provider configuration

| Provider | Base URL | Notes |
|---|---|---|
| OpenCode Zen (default) | `https://opencode.ai/zen/v1` | OpenAI-compatible `GET /models` + `POST /chat/completions`. Verified Oct 2026 against public docs. |
| Google AI Studio (Gemini) | `https://generativelanguage.googleapis.com/v1beta/openai` | Documented OpenAI-compat layer; Gemini API key sent as Bearer. Verified Oct 2026: https://ai.google.dev/gemini-api/docs/openai |
| OpenAI | `https://api.openai.com/v1` | Same endpoints. |
| Custom | your URL | Any OpenAI-compatible gateway. |

- No free model is hardcoded. Enter any model ID your key can access; setup fails
  with a clear 404-style message if the model is unavailable, and invalid keys fail with 401.
- `Test connection` does `GET {base}/models` (skipped gracefully if the gateway disables it)
  then a tiny `POST {base}/chat/completions` probe. Rate limits (429) and network failures
  surface as explicit errors. Nothing is saved until the probe succeeds, and paid-model
  switching never happens silently — the model you type is the model used.

## Credential storage & security

- **All AI calls run on the server** (`lib/providers/*`, API routes, worker). The key never
  ships in `localStorage`, URLs, logs, `NEXT_PUBLIC_*`, or client bundles.
- **Default: session-only.** The key lives in a server-side session store
  (`data/sessions.json`) tied to an `HttpOnly; SameSite=Lax` cookie (`diffox_session`).
  Closing the browser drops the cookie; restarting the server with a fresh store requires setup again.
  The browser only ever receives connection status + a masked indicator (`••••1234`).
- **Optional “Remember my key”:** AES-256-GCM encrypts the key with `ENCRYPTION_SECRET`
  into `data/vault.json`, scoped to the single local owner. If `ENCRYPTION_SECRET` (< 32 chars
  or missing) is not set, the checkbox is disabled by both API and UI.
- **Owner auth:** every dashboard page (server check) and every `/api/*` review/settings
  endpoint requires the session cookie. There is no anonymous endpoint that spends your key.
- **Manage:** Settings → Verify & save (replace) or Delete key (clears session + vault, signs out).

## Worker & job queue

- `POST /api/reviews` validates input (10–120k chars) and appends a `pending` job to the
  durable file queue `data/db.json` (`jobs[]` + `reviews[]`). The request returns immediately.
- `worker/review-worker.ts` is a **separate Node.js process** (`npm run worker`, `tsx`-run TypeScript
  in the same repo). It polls, claims jobs, calls the model with bounded retries (3 attempts,
  exponential backoff on 429/5xx), validates output with zod, verifies file/line refs against
  the submitted diff (`lib/diff/parse.ts` — unverified refs are nulled, never fabricated),
  and writes `completed`/`failed`. Failed jobs keep their error and show a **Retry** button
  (`POST /api/reviews/[id]/retry`). No unawaited background promises inside requests.

## Review engine

- `lib/providers/openai-compatible.ts` — provider abstraction (`listModels`, `testConnection`, `chatCompletion`, `withBackoff`).
- `lib/review/prompt.ts` — system prompt pins the model to strict JSON, marks submitted code
  as untrusted (never instructions, never executed), and focuses on correctness/security/performance.
- `lib/review/schema.ts` — zod schema (`summary`, ≤30 findings) + fence-tolerant JSON extraction.
- Long reviews surface `incomplete: true` with a visible warning banner.

## Scripts

- `npm run dev` / `build` / `start` — app
- `npm run worker` — review worker (required for real reviews)
- `npm run verify` — runs `scripts/verify.ts` checks (diff parser, schema, masked-key hygiene)

## What still needs configuration

- **GitHub App integration:** Repositories/Settings show an honest “not configured” state.
  Data model is reserved (`repositories[]` in `data/db.json`); webhooks + installation flow are not implemented.
- **Production hardening:** set `ENCRYPTION_SECRET`, run behind HTTPS (cookies gain `Secure`),
  back `data/` up, and consider moving the JSON store to SQLite/Postgres + a real queue for multi-user use.
