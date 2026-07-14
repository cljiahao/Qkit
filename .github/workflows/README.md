# workflows

## Purpose

GitHub Actions CI pipelines: `ci.yml` (typecheck, lint, test, build, e2e, db, mutation) and `security.yml` (gitleaks secret scan, CodeQL, `pnpm audit`).

## Contents

- `ci.yml` — triggers on push to `main` and on every PR. Jobs: `test` ("check + unit" — `pnpm check` then `pnpm test`); `e2e` ("e2e (auth-guard)" — runs only `e2e/auth-guard.spec.ts` against dummy Supabase env vars, since that spec only needs the app to boot and `getUser()` to return null with no network call; uploads the Playwright report on failure); `e2e-order` ("e2e (order lifecycle)" — installs the Supabase CLI, runs `supabase start` to apply every migration, seeds `supabase/seed/ci-auth-bootstrap.sql` + `supabase/seed/coffee-cart.sql` via `psql`, exports the live local Supabase creds into `$GITHUB_ENV` for the app to pick up, then runs `e2e/customer-order.spec.ts` and `e2e/order-code.spec.ts`, always tearing down with `supabase stop`); `db` ("db (migrations + pgTAP RLS)" — `supabase start` (applies every migration, failing the job if one is malformed) then `supabase test db` runs the pgTAP suite in `supabase/tests/rls.test.sql`); `build` ("build (next build)" — `pnpm build` with dummy Supabase env vars since dynamic routes render at request time); and `mutation` ("mutation (changed lib)" — PR-only, diffs `src/lib/**/*.ts` changes against the PR base ref and runs `stryker run --mutate` scoped to just those changed files, skipping entirely if none changed; advisory-only since Stryker's `break: null` never fails CI).
- `security.yml` — triggers on push to `main`, every PR, and a weekly cron (`0 6 * * 1`, CodeQL only). Default job permission is `contents: read`. Jobs: `gitleaks` ("secret scan" — skipped on the scheduled run; widens permissions to add `pull-requests: read` for the PR-scan API call; checks out full history (`fetch-depth: 0`) and runs `gitleaks/gitleaks-action` v3); `audit` ("dependency audit (pnpm)" — skipped on the scheduled run; hard-gates on `pnpm audit --prod --audit-level=high`, then runs a full `pnpm audit --audit-level=high || true` informationally for devDeps); `codeql` ("CodeQL (javascript-typescript)" — only runs `if: github.event.repository.private == false`, i.e. self-skips on this private repo since code scanning upload requires GitHub Advanced Security on private repos; would self-enable if the repo went public — uses `security-extended` queries, needs `security-events: write`).

## Connectivity

Both workflows pin every third-party action to a full commit SHA (with a version comment) rather than a floating tag. `ci.yml`'s `e2e-order` and `db` jobs depend on `supabase/seed/coffee-cart.sql` and `supabase/seed/ci-auth-bootstrap.sql` (outside this folder) and on every file in `supabase/migrations/` applying cleanly. `security.yml` mirrors what the `/security-scan` project skill (`.claude/skills/security-scan/`) runs locally before a push.

## Parent

[.github](../README.md)
