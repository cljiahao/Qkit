# QKit Constitution

Inviolable principles for this project. This is the _why-never-change_; `AGENTS.md`
is the _how-to-route_. When a change appears to require breaking one of these,
stop and reconsider the change — do not break the principle.

## 1. Authorization lives in Postgres RLS, never app code

A vendor sees/edits only their own `vendors` row, their own `booths`, and `orders`
whose `booth_id` belongs to them. Active booths are publicly readable; anyone may
INSERT an order. **Never widen an RLS policy to make a query pass** — fix the
query or the session instead. RLS is the security boundary; app checks are
convenience, not enforcement.

## 2. The service-role client is server-only

Use it only in Server Actions / Route Handlers (e.g. the customer status page that
must bypass RLS). Never in a client component, never behind `NEXT_PUBLIC_*`. It
bypasses RLS entirely.

## 3. Validate every boundary with Zod; TypeScript stays strict

All user input (forms + server actions) is parsed with a Zod schema at the
boundary. No `any`, no `@ts-ignore`.

## 4. No secrets in `NEXT_PUBLIC_*`

`NEXT_PUBLIC_*` is inlined into the browser bundle at build time. Only the
publishable Supabase key and URL belong there. Rebuild after changing them.

## 5. Supabase client versions stay compatible

`@supabase/ssr` (0.10.x) ↔ `@supabase/supabase-js` (2.10x). A mismatch silently
degrades every typed query to `never`.

## 6. Schema changes are dual-written

Any schema edit updates both `supabase/migrations/` and `src/lib/types.ts` (or
regenerates types via `supabase gen types typescript`).

## 7. Permission deny-rules are a guardrail, not a sandbox

The `.claude/settings.json` deny list (force-push, hard reset, `rm -rf`, secret
reads) is prefix-matched and bypassable via wrappers — it's a circuit-breaker
against model error, not OS-level enforcement. Never treat it as a security
boundary. Real secrets stay git-ignored and out of the repo.

## Test matrix

| Layer         | Tool                            | Scope                       | CI                |
| ------------- | ------------------------------- | --------------------------- | ----------------- |
| Unit          | vitest `*.test.ts`              | `src/lib` pure logic        | every push/PR     |
| Component     | vitest `*.dom.test.tsx` (jsdom) | React behavior              | every push/PR     |
| E2E           | playwright                      | auth guard, order lifecycle | push/PR (subset)  |
| RLS           | pgTAP (`supabase test db`)      | cross-vendor isolation      | local / opt-in CI |
| Mutation      | stryker (`src/lib`)             | advisory, changed files     | PR only           |
| Type/lint/fmt | `pnpm check`                    | prettier + eslint + tsc     | every push/PR     |

Security: `gitleaks` (secrets), CodeQL (SAST), `pnpm audit` + Dependabot
(dependency vulns) — see `.github/workflows/security.yml`.
