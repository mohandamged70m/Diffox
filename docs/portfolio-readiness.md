# Portfolio readiness review — 13 October 2026

## Verdict

**The original main branch is not ready to showcase as a working live reviewer.**
The public deployment `https://diffox.vercel.app` returned HTTP 200, but the
health response reported `supabase: false` and `githubApp: false`. Its timestamp
was from the prior day because Next.js 14 statically generated this GET endpoint.
Treat those values as a cached deployment snapshot; confirm actual runtime
configuration after deploying the dynamic health fix.

This PR fixes code/release blockers and provides a release checklist. It does not
configure hosted secrets, apply remote migrations, deploy a persistent worker,
or prove an AI/GitHub end-to-end run. Share it now only as a clearly labeled MVP;
share a live working demo after completing [deployment.md](deployment.md).

## Findings and remediation

| Finding | Change / required follow-up |
| --- | --- |
| App installation existence was mistaken for user authorization | Fetch the signed-in user's linked GitHub OAuth token; require personal ownership or active organization ownership before binding |
| Existing bindings could have been created without ownership proof | Migration 0003 adds `verified_at`; reconnect old bindings; webhook and worker reject unverified bindings |
| Dockerfile copied missing `public` and `scripts` folders | Remove those COPY instructions, use Node 22, pass the public Clerk key at build time |
| Worker did not load the documented `.env` | Load env through Next's env loader before initializing the worker |
| Empty `.env.example` values failed env validation | Treat empty integration values as unconfigured; regression test |
| Verify script pointed to a nonexistent file | Replace with typecheck + tests + production build; add CI and Docker build check |
| Failed webhook deliveries were permanently marked handled | Record only successful handling; return retryable errors for enqueue/lookup failures |
| Long reviews could outlive the worker lease | Renew leases while processing and check ownership before publication/persistence |
| Old framework/test/tooling dependencies had advisories | Upgrade dependencies and validate the updated lockfile with npm audit |
| Provider error bodies could echo credentials/private input | Return generic status-based errors; regression test |
| Health endpoint cached build-time configuration | Make it dynamic so runtime flags and timestamps are fresh |
| Public deployment missing backend configuration | Configure Supabase/GitHub and host the persistent worker; see deployment guide |

## Evidence and limits

The original source passed 33 tests, TypeScript, and a production build before
changes. New authorization, env, and retry regression checks are included in the
PR. The updated source passes **46 tests**, TypeScript, and a production build;
final command results are also recorded in the PR description.

Automated tests validate code behavior, not credentials or a hosted database.
The final production dependency audit reports **0 vulnerabilities**. The full
audit still reports **7 development-only advisories** (5 high, 2 moderate) in
Tailwind 3 and its transitive build tools. They do not appear in the production
dependency audit; resolve them with a separately tested Tailwind 4 migration
before claiming an entirely clean dependency audit.

No real AI review was generated and no third-party review comments were posted
as part of this readiness check. Docker is unavailable in this workspace; CI
contains the Docker build check.

## Scope for launch

This is an MVP, not a production service certification. For wider public use,
add rate limits and account quotas, retention/deletion controls, integration
monitoring, a worker readiness signal, and tenant/revocation integration tests.
The job queue and GitHub publication are not one distributed transaction;
markers reduce duplicate feedback on retries but do not establish an absolute
exactly-once guarantee across crashes and concurrent network failures. Large
PR input is bounded; verify coverage reporting when GitHub truncates patches
or comparisons. Review findings remain suggestions to assess manually.

There is no repository license. Choose one before promoting it as open source;
showcasing your own project in a portfolio does not require adding a license.
