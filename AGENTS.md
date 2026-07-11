<!-- templateCentral: nextjs@5.7.0 (Supabase variant — NOT better-auth/Drizzle) -->

# AGENTS.md — QKit

> STOP — This project diverges from the stock templateCentral Next.js stack on
> the data layer only. Auth/DB/realtime are **Supabase** (`@supabase/ssr`), not
> better-auth + Drizzle. Authorization is enforced in Postgres via **RLS**, not
> an app repository layer. Runtime matches tc: Next 16, route protection in
> `src/proxy.ts`, and `cookies()`/`headers()`/`params`/`searchParams` are async.

## What QKit is

Vendor booth ordering system. Vendors sign in to manage menus and watch live
orders; customers order from a QR-linked booth page and track status in realtime.

## Stack

Next.js 16 · App Router · Turbopack · TypeScript strict · Tailwind v4 · shadcn/ui
(new-york) · TanStack Query v5 · React Hook Form · Zod · Supabase (`@supabase/ssr`)
Vitest · pnpm 11 · Node ≥24 · deploy target: Vercel

## Commands

```bash
pnpm dev          # dev server — http://localhost:3000
pnpm build        # production build
pnpm test         # run test suite (vitest)
pnpm test:mutation # stryker mutation testing (scoped to src/lib; ~1 min)
pnpm test:e2e     # playwright e2e smoke (needs local Supabase up — see below)
pnpm check        # prettier --check + eslint + tsc --noEmit
pnpm format       # prettier --write
```

E2E (Playwright, `e2e/`) is a small critical-path smoke against a REAL local
Supabase — it covers what the mocked unit/component tests cannot (RLS, the
`proxy.ts` auth guard, the full order lifecycle). To run:

1. Docker running, then `supabase start`
2. apply migrations + the `supabase/seed/coffee-cart.sql` seed
3. `pnpm test:e2e` (auto-starts `pnpm dev`)
   `auth-guard.spec.ts` needs only a booting app; `customer-order.spec.ts` needs
   the coffee-cart seed (the "Kopitiam Cart" booth).

Mutation testing (Stryker) is scoped to `src/lib` — the pure business logic.
Components/actions/supabase clients are excluded (I/O- or DOM-bound, low signal).
**Advisory only** — non-blocking (no CI gate); run on demand when changing
`src/lib` and treat survivors as a review prompt (many remaining are equivalent
mutants). Component behavior is covered by RTL+jsdom tests (`*.dom.test.tsx`),
unit logic by node tests (`*.test.ts`).

## File Layout

```
src/app/                        — app router (pages, layouts, server actions)
src/app/(auth)/                 — login page: email/password sign-in + sign-up; Google OAuth via src/app/auth/callback
src/app/dashboard/              — vendor dashboard (realtime order board)
src/app/order/[boothId]/        — customer menu + cart + placeOrder action
src/app/order/[boothId]/[orderNumber]/ — live order status page
src/proxy.ts                    — Supabase session refresh + /dashboard guard (Next 16)
src/lib/supabase/               — browser / server / service clients + mw helper
src/lib/types.ts                — DB types (mirror of supabase/migrations)
src/lib/schemas.ts              — Zod schemas for forms + actions
src/components/ui/              — shadcn primitives (CLI-managed, do not hand-edit)
src/hooks/use-realtime-orders.ts — Supabase realtime subscription
supabase/migrations/            — SQL schema + RLS + realtime publication
```

## Data model

- `vendors` (id = auth.users.id), `booths` (JSONB `menu_items`),
  `orders` (JSONB `items`, `order_status` enum: pending→confirmed→preparing→ready→completed, + cancelled).
- RLS: a vendor sees/edits only their own `vendors` row, their own `booths`,
  and `orders` whose `booth_id` belongs to them. Active booths are publicly
  readable (customer ordering). Anyone may INSERT an order. The customer status
  page reads via the **service-role client** (bypasses RLS) — server-only.

## Rules (always)

- TypeScript strict — no `any`, no `@ts-ignore`.
- Validate all user input with Zod at every boundary (forms + server actions).
- Authorization lives in **RLS policies**, not in app code. Never widen a policy
  to "fix" a query — fix the query or the session instead.
- Use the **service-role client only** in Server Actions / Route Handlers, never
  in client components. It bypasses RLS.
- No secrets in `NEXT_PUBLIC_*`. `NEXT_PUBLIC_SUPABASE_*` are inlined at build —
  rebuild after changing them.
- `@supabase/ssr` and `@supabase/supabase-js` versions must stay compatible
  (currently ssr 0.10.x ↔ supabase-js 2.48.x — check package.json, not this
  number, since both get bumped) or every query degrades to `never`.
- After editing the schema, update both `supabase/migrations/` and `src/lib/types.ts`
  (or run `supabase gen types typescript` once the CLI is installed).

## Skills

### Project skills — check here first (`.claude/skills/`)

| Skill               | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `/next-verify`      | typecheck + lint + test in one pass                          |
| `/supabase-migrate` | apply `supabase/migrations` + regenerate types (safety gate) |
| `/security-scan`    | local secret scan (gitleaks) + dependency audit before push  |
| `/changelog`        | append a Keep-a-Changelog entry under `[Unreleased]`         |

### templateCentral plugin skills

templateCentral has **no Supabase support** (auth=better-auth, db=Drizzle/Kysely/Mongoose,
no realtime). Use only the stack-agnostic ones here:
| Skill | When to use |
|-------|-------------|
| `templatecentral:standards` | naming/validation/drift-check (expect Supabase-vs-tc drift findings) |

Do **not** run `templatecentral:add (auth)` or `(database)` — they install
better-auth / Drizzle and will break RLS + realtime.

**5.0 → 5.7 review (2026-07-03):** version marker + `harness.json` bumped to 5.7.0.
Deliberately **not** adopted (Supabase-variant / bespoke-harness divergence, each
a conscious choice — don't let a future drift-check "fix" them):

- **pino route-logging enforcement** (5.7) — pino was removed as an unused dep;
  QKit's API surface (one route) logs via `console.error`, not the tc `withLogging`
  wrapper. No `scripts/check-route-logging.mjs` gate.
- **lefthook** (5.2) — QKit uses husky + lint-staged; not migrating the git-hook system.
- **tc CI gates + `verify-harness.sh` / `.harness-base`** (5.2–5.3) — QKit has its own
  CI (`.github/workflows/{ci,security}.yml`); no harness re-sync base exists (seeded
  pre-5.3), so `migrate` Phase-5 3-way merge is N/A.
- **password min-12 on the login schema** (5.5) — would lock out existing 8-char
  sign-ins; Supabase Auth config owns the real policy.

Adopted: build-artefact `Read` denies in `settings.json` (context hygiene, 5.4).

**Cherry-picked 5.8 comment gate (2026-07-10):** not a full 5.7→5.9 re-review,
just this one delta. `no-inline-comments` flipped `warn` → `error` (own-line
comments only, ignore-pattern for `eslint-`/`@ts-`/`prettier-`/coverage
directives) and `sonarjs/no-commented-code` added at `error` (blocks
committing dead commented-out code) — `eslint-plugin-sonarjs` is a new
devDependency. Both hard-block `pnpm check`/CI now. Test files and `scripts/`
keep `no-inline-comments` off (unchanged rationale: table-driven fixtures read
better with a trailing note).

## AI Harness

PreToolUse: blocks secret files (exit 2): `.env*` (except `.env.example`),
cert files (`.pem`/`.key`/`.p12`/`.pfx`/`.secret`), `credentials.json`/`.netrc`/`.secrets`;
and blocks `--no-verify`. App code, skills, specs, and `.github/workflows/`
unrestricted (CI is reviewed code; the workflow-write block was lifted 2026-06-16).
UserPromptSubmit: pattern-checks prompts for injection phrases; exit 2 blocks.
PostToolUse: `tsc --noEmit --incremental` after every Edit/Write. Feedback-only.
Stop: exits 0 when `stop_hook_active` (no re-entry loop); else runs the test
suite, exit 2 feeds failures back, exit 0 on pass.
SessionStart (startup|resume|compact): re-injects first 30 lines of this file —
the documented inject path (PostCompact stdout is ignored, cannot inject context).
`permissions`: max-privilege — bare-tool `allow` (Bash/Read/Edit/Write/web/Skill/
Task) so common work doesn't prompt; `deny` covers secret reads/edits (`.env.local`
and other `.env.<env>` variants, `./secrets/**` — `.env.example` is the one
whitelisted env file) and irreversible ops (`rm -rf`, `git push --force`/`-f`,
`git reset --hard`, `git clean -fd/-fx`, `git filter-branch`, ref-delete). Deny
always wins (enforced even under bypass); it's a guardrail, not a sandbox —
prefix-matched and wrapper-bypassable. CI security: `.github/workflows/security.yml`
(gitleaks v3 + CodeQL + `pnpm audit`) and `.github/dependabot.yml` (security-only).
RLS isolation: `supabase/tests/rls.test.sql` via `supabase test db`.
Project skills (directory form, `<name>/SKILL.md`): `.claude/skills/` |
Manifest: `.claude/harness.json`

## Skills Security

- Review `SKILL.md` before installing any third-party skill — treat skills like packages.
- Scope `allowed-tools:` to the minimum (e.g. `Bash(git *)` not `Bash`).
- Never install skills that hardcode secrets or make unlisted outbound calls.

## Project-Specific Notes

- **Inviolable rules:** `docs/constitution.md` (RLS-is-authz, service-role
  server-only, Zod boundaries, no secrets in `NEXT_PUBLIC_*`, deny-rules are a
  guardrail not a sandbox). Read it before changing auth, schema, or the harness.
- Plan of record: `docs/superpowers/plans/2026-06-05-qkit-core.md` (specs in
  `docs/superpowers/specs/`; roadmap/audit/task-registry meta docs in `docs/meta/`).
- Migrated 15→16 on 2026-06-05 (`middleware.ts`→`proxy.ts`, `next lint`→eslint CLI).
<!-- [[post-harness]] — reserved for trace capture and meta-harness integration -->
