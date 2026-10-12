# AI provider setup

DifFox reviews with **one OpenAI-compatible provider** in this MVP. You bring your own
key and model — no free or unlimited model usage is included or promised.

## How it works

- The provider **endpoint is controlled by the server** via `AI_PROVIDER_BASE_URL`
  (default `https://opencode.ai/zen/v1`). It cannot be changed from the browser, so a
  saved key can never be redirected to a rogue endpoint.
- Each account saves its own **key + model** in **Settings → AI credentials**.
- Saving probes the provider first (`GET /models`, then a tiny `POST /chat/completions`):
  nothing is stored until the probe succeeds. Invalid keys fail with 401-style errors,
  unknown models with 404-style errors, rate limits surface explicitly.
- Saved keys are encrypted server-side with **AES-256-GCM** (fresh 96-bit nonce per
  encryption, authentication tag + version stored alongside) using `ENCRYPTION_SECRET`
  (passphrase, 32+ chars). Keys are **never returned to the browser** (only a masked
  `••••1234` indicator), never logged, and never exposed via client environment variables.
- You can **save/replace, test, and delete** the key at any time from Settings.
  Deleting pauses automatic reviews until a new key is saved.

## Supported provider

| Endpoint | Protocol | Notes |
|---|---|---|
| OpenCode Zen (`https://opencode.ai/zen/v1`, default) | OpenAI-compatible `GET /models` + `POST /chat/completions` | Enter any model ID your key can access. |
| Any OpenAI-compatible gateway | Same two endpoints | Set `AI_PROVIDER_BASE_URL` server-side. OpenAI (`https://api.openai.com/v1`) and Gemini's OpenAI-compat layer (`https://generativelanguage.googleapis.com/v1beta/openai`) follow the same protocol. |

The **model is fully configurable** — type any model ID your key can access. Switching
models never happens silently: the model you type is the model used, and paid-model
billing is between you and your provider.

## Privacy notice

**Repository code you review is sent to the configured provider** to generate the review.
Only the diff and surrounding code needed for the review are sent; keys and GitHub
tokens are never included in model input, and repository content is treated as untrusted
data (never instructions, never executed).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Saving disabled | `ENCRYPTION_SECRET` missing or shorter than 32 chars | Set it server-side and restart |
| 401 on save/test | Invalid or revoked key | Replace the key |
| 404 on save | Model ID not available to the key | Check spelling / provider model list |
| 429 on save/test | Rate-limited | Wait and retry; reviews also back off and retry |
