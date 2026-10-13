# End-to-end test: deliberate bug → review → fix → re-review

This exercises the full loop with a real PR containing an intentional auth bug.
For a no-GitHub dry run, use the local-test variant at the bottom.

## Prerequisites

- DifFox deployed with public HTTPS (webhook must reach `/api/webhooks/github`).
- Clerk + Supabase configured, all migrations applied, GitHub identity linked and installation verified.
- AI key saved in Settings, GitHub App installed on a **test repository**.

## The deliberate bug

Create a PR in the test repo adding `app/api/notes/route.ts`:

```ts
import { NextResponse } from "next/server";

// DELIBERATE BUG (e2e fixture): no auth check, no input validation.
export async function POST(req: Request) {
  const { userId, text } = await req.json();
  await db.query(`INSERT INTO notes (user_id, text) VALUES ('${userId}', '${text}')`);
  return NextResponse.json({ ok: true });
}
```

Expected DifFox findings (any model should catch at least the SQL injection):

1. **SQL injection** (critical/high) — string-interpolated query; suggest parameterized queries.
2. **Missing authorization** (high) — `userId` taken from the body; suggest session-derived identity.
3. **Unvalidated input / broken error handling** (medium) — `req.json()` can throw; `text` unbounded.

## Steps

1. Open the PR → webhook `pull_request: opened` → job queued (`Reviews` shows `queued` → `running`).
2. After the worker claims and processes the job, the bot posts **one** review (`COMMENT` event): summary +
   inline comments on the added lines. `Reviews → detail` shows the same summary,
   findings with severity/evidence/fix, reviewed commit = PR head SHA, skipped files.
3. Push a fix (parameterized query + session user + validation) → `synchronize` →
   new job in **incremental** mode; detail shows “incremental since …”.
4. Merge the PR → no further jobs (closed PRs are skipped).

## Pass criteria

- Exactly one GitHub review per head SHA (check the `<!-- diffox:<id> -->` marker).
- Inline comments attach only to diff lines; anything else lands in the summary.
- Skipped files (if any) are listed, never silent.
- No approval, request-changes, or merge action by the bot.

## Retry / crash check (optional)

Kill the worker mid-review (`status = running` with a live lease), restart it: the
lease expires, the job is reclaimed, and the retry **adopts** the posted review via
its marker instead of posting a duplicate.

## Local-test variant (no GitHub)

Set `DIFFOX_LOCAL_TEST=1` in both the web and worker environment.

```bash
DIFFOX_LOCAL_TEST=1 npm run worker
```

```bash
curl -X POST http://localhost:3000/api/test/local-review \
  -H 'Content-Type: application/json' \
  -H "Cookie: <session cookie after signing in>" \
  -d @- <<'EOF'
{
  "repo_full_name": "local/e2e",
  "pr_number": 1,
  "head_sha": "e2e001",
  "diff": "diff --git a/app/api/notes/route.ts b/app/api/notes/route.ts\n+++ b/app/api/notes/route.ts\n@@ -1,6 +1,8 @@\n import { NextResponse } from \"next/server\";\n+// DELIBERATE BUG: no auth check, no input validation.\n export async function POST(req: Request) {\n-  const { userId } = await req.json();\n+  const { userId, text } = await req.json();\n+  await db.query(`INSERT INTO notes (user_id, text) VALUES ('${userId}', '${text}')`);\n   return NextResponse.json({ ok: true });\n }"
}
EOF
```

Open the resulting review in **Reviews** — the summary starts with
`[SIMULATED — local test mode, not a real GitHub review]`. Confirm findings call out
the SQL injection and missing authorization. **Never present this as a real GitHub result.**
