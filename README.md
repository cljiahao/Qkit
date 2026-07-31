# qkit

Vendor booth ordering system. Vendors sign in to manage their menu and watch
live orders; customers scan a booth QR code, order from the menu, and track
their order status in realtime.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · shadcn/ui (new-york) ·
Supabase (`@supabase/ssr` — auth, Postgres, realtime) · TanStack Query ·
React Hook Form · Zod · Vitest · pnpm.

## Routes

| Route                            | Who           | Purpose                                            |
| -------------------------------- | ------------- | -------------------------------------------------- |
| `/login`, `/register`            | vendor        | Supabase email/password auth                       |
| `/dashboard`                     | vendor (auth) | realtime order board; tap a card to advance status |
| `/order/[boothId]`               | customer      | menu + cart + checkout                             |
| `/order/[boothId]/[orderNumber]` | customer      | live order status                                  |

## Getting started

```bash
pnpm install
cp .env.example .env.local   # then fill in the values below
pnpm dev                     # http://localhost:3000
```

### Environment

Set these in `.env.local` (find them in Supabase → Project Settings → API).
`NEXT_PUBLIC_*` values are inlined at build time — **rebuild after changing them**.

| Var                                    | Notes                                                     |
| -------------------------------------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | project URL                                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key (client-safe, respects RLS)               |
| `SUPABASE_SECRET_KEY`                  | server-only; used by the order-status page (bypasses RLS) |
| `NEXT_PUBLIC_BASE_URL`                 | e.g. `http://localhost:3000`                              |

### Database

Apply the schema (creates tables, the `order_status` enum, RLS policies, and the
realtime publication):

- **With the Supabase CLI:** `supabase db push`, then
  `supabase gen types typescript --linked > src/lib/types.ts`.
- **Without the CLI:** paste `supabase/migrations/0001_initial_schema.sql` into
  Supabase → SQL Editor → Run. `src/lib/types.ts` is already hand-written to match.

Seed a test booth (Supabase → Table Editor → `booths.menu_items`):

```json
[
  {
    "id": "item-1",
    "name": "Nasi Lemak",
    "description": "With sambal and egg",
    "price_cents": 800,
    "available": true
  },
  {
    "id": "item-2",
    "name": "Teh Tarik",
    "description": "Pulled milk tea",
    "price_cents": 350,
    "available": true
  }
]
```

## Scripts

```bash
pnpm dev      # dev server
pnpm build    # production build
pnpm test     # vitest
pnpm check    # prettier --check + eslint + tsc --noEmit
pnpm format   # prettier --write
```

## Deployment

Deploys to Vercel. Set the four env vars above in the Vercel project for both
Production and Preview. Supabase realtime requires the `orders` table in the
`supabase_realtime` publication — included in the migration.

## Data model

- `vendors` — one row per auth user (`id` = `auth.users.id`).
- `booths` — belong to a vendor; menu is JSONB `menu_items`.
- `orders` — belong to a booth; JSONB `items`, `order_status` enum
  (`pending → confirmed → preparing → ready → completed`, plus `cancelled`).

Authorization is enforced in Postgres via RLS: vendors only ever see their own
booths and orders. See `AGENTS.md` for full conventions.

## Structure

### Contents

- `.claude/` — the Claude Code agent harness: hooks, project skills, harness integrity scripts, and the harness manifest recording what templateCentral seeded (own README).
- `.env.example` — template env file: Supabase URL/publishable key/secret key, `NEXT_PUBLIC_BASE_URL`, the Merqo dashboard metrics-endpoint bearer secret (`MERQO_METRICS_SECRET`), the loopkit deployment URL used to build the order-status page's "Earn a stamp" link (`NEXT_PUBLIC_LOOPKIT_URL`, fails closed if unset), and Google OAuth client id/secret consumed by `supabase start` for local auth; copy to `.env.local` and fill in.
- `.github/` — GitHub-specific config: CI/CD workflows (`ci.yml`, `security.yml`) and Dependabot (own README).
- `.gitignore` — standard ignore list: `node_modules`, build/test output (`.next`, `coverage`, `.stryker-tmp`, `reports`, `test-results`, `playwright-report`), the local-only `.superpowers` brainstorming-mockup dir, the per-machine `.agents` harness symlink, env files (`.env`, `.env.local`), `*.tsbuildinfo`/`next-env.d.ts`, `.vercel`, and `.worktrees/`.
- `.gitleaks.toml` — gitleaks secret-scan config: extends the default ruleset, allowlists `.env.example`/`.env.default` and lockfiles (`pnpm-lock.yaml`, etc.) as known non-secrets.
- `.husky/` — the git-hook layer (husky v9, no native binary): `pre-commit` (format/lint + format-docs + typecheck + lockfile-frozen-install + gitleaks secret-scan + README-coupling nudge), `commit-msg` (Conventional Commits gate), `pre-push` (harness-integrity check + `pnpm run check && pnpm test`); `lib/` holds the `readme-coupling.sh` and `commit-msg-check.sh` script bodies the hooks delegate to (own README).
- `.prettierignore` — files/dirs Prettier skips: `pnpm-lock.yaml`, `.claude/.harness-base`, build/test output (`.next`, `node_modules`, `coverage`, `test-results`, `playwright-report`), and `scripts/demo/out`.
- `.prettierrc.json` — Prettier config: `endOfLine: "auto"` (avoids CRLF/LF diff noise across contributors on different OSes).
- `AGENTS.md` — routing/conventions doc for AI coding agents: stack divergence note (Supabase, not templateCentral's default better-auth/Drizzle), commands, file layout, data model, RLS/service-role rules, the AI harness description, and a running log of which templateCentral deltas were adopted vs. deliberately skipped.
- `CHANGELOG.md` — Keep-a-Changelog history; entries are added under `[Unreleased]` by the `/changelog` skill.
- `CLAUDE.md` — a one-line pointer that routes Claude Code to `AGENTS.md` via an `@AGENTS.md` import (`Routing and conventions for this project live in AGENTS.md. Read it first.`).
- `FUTURE.md` — inactive design seams inherited from templateCentral v4.0 (Meta-Harness CI, Trace-Driven Evolution, Environment Engineering) — integration points only, nothing here runs unless built out.
- `components.json` — shadcn/ui CLI config: `style: new-york`, RSC + TSX on, `baseColor: neutral`, CSS variables, and the path aliases (`@/components`, `@/components/ui`, `@/lib`, `@/hooks`) the `shadcn` CLI writes generated components into.
- `docs/` — deploy notes, the engineering constitution, business/GTM docs, and dated design/plan history (own README).
- `e2e/` — Playwright specs for the auth-guard and customer-order-lifecycle smoke tests (own README).
- `eslint.config.mjs` — flat ESLint config: extends `eslint-config-next`, ignores generated/build dirs (`node_modules`, `.next`, `supabase`, `coverage`, etc.), adds `eslint-plugin-sonarjs` with `no-inline-comments` and `sonarjs/no-commented-code` as hard `error`s repo-wide (turned back off for `*.test.{ts,tsx}`, `test/**`, `scripts/**`, `e2e/**`, where inline notes on table-driven fixtures read better), and `@typescript-eslint/no-unused-vars` (`warn`, `^_`-prefix ignore pattern) reusing the `@typescript-eslint` plugin instance `eslint-config-next` already registers.
- `next.config.ts` — Next config: `output: standalone`, `reactStrictMode`, `poweredByHeader: false`, dev indicator disabled, `images.remotePatterns` allow-listing local Supabase/`*.supabase.co`/`*.googleusercontent.com`, a `/register`→`/login` redirect, and a `headers()` function that sets a full security-header set (X-Frame-Options, HSTS, etc.) plus an environment-aware Content-Security-Policy (relaxes `script-src`/`connect-src`/`img-src` for local dev only).
- `package.json` — scripts (`dev`/`build`/`test`/`test:mutation`/`test:e2e`/`check`/`format`/`demo:record`/`demo:compose`/`prepare`), the dependency set (Next 16, `@supabase/ssr` + `@supabase/supabase-js`, Radix/shadcn deps, `react-hook-form` + `zod`, `recharts`, `driver.js`, `react-qr-code`, `@icons-pack/react-simple-icons` (real brand-logo icons), the dev toolchain (`vitest`, `@playwright/test`, `@stryker-mutator/*`, `eslint` + `eslint-plugin-sonarjs`, `husky`, `prettier`). `prepare` runs `husky`.
- `playwright.config.ts` — e2e config: `testDir: ./e2e`, fully parallel, `webServer` auto-starts `pnpm dev` against `http://localhost:3000`, a single `chromium` project, and an HTML report emitted in CI (for the failure-artifact upload in `.github/workflows/ci.yml`).
- `pnpm-lock.yaml` — generated pnpm lockfile; not hand-edited.
- `pnpm-workspace.yaml` — pnpm settings: `allowBuilds` for `supabase`/`esbuild`/`sharp`/`unrs-resolver`, and pinned `overrides` that force-patch transitive advisories (`postcss`, `undici`, `vite`, `qs`) to fixed-version ranges, each scoped to self-clear once the parent dep ships the patched version.
- `postcss.config.mjs` — minimal PostCSS config wiring the `@tailwindcss/postcss` plugin (Tailwind v4's PostCSS integration).
- `public/` — static assets served as-is by Next.
- `scripts/` — the demo-video generator (`demo:record`/`demo:compose`); the former `check-readme-freshness.mjs` pre-commit nudge now lives at `.husky/lib/readme-coupling.sh`.
- `src/` — the Next.js app itself (App Router pages/actions, `src/lib`, `src/components`, `src/hooks`, `src/proxy.ts`).
- `stryker.conf.json` — mutation-testing config: vitest runner, mutates only `src/lib/**/*.ts` (excludes `*.test.ts`, `types.ts`, `action-result.ts`, `supabase/**`), advisory only (`thresholds.break: null`, so a low score never fails CI).
- `supabase/` — the Postgres schema: `migrations/` (SQL + RLS + realtime publication), seed data, and pgTAP RLS tests.
- `test/` — Vitest tests and setup not colocated with their source (e.g. API-route tests).
- `tsconfig.json` — TypeScript strict compiler options, the `@/*` → `./src/*` path alias, and `.next/types` generated-type includes.
- `vercel.json` — Vercel deploy config: pins the deployment region to `sin1` (Singapore).
- `vitest.config.ts` — Vitest config: `@` alias to `src/`, `node` test environment, dummy `NEXT_PUBLIC_SUPABASE_*` env vars so `src/lib/env` validation doesn't throw during tests, `test/setup.ts` as the global setup file, and v8 coverage over `src/**/*.{ts,tsx}`.

### Connectivity

`src/` is the Next.js app itself; `supabase/` holds the Postgres schema and RLS
policies it depends on, applied via the Supabase CLI or SQL Editor (or the
`/supabase-migrate` skill). Two separate test layers sit alongside it: `e2e/`
(Playwright, against a real local Supabase, run via `playwright.config.ts`)
and `test/` (Vitest, for code not colocated with its source, run via
`vitest.config.ts`); `stryker.conf.json` adds an advisory mutation-testing pass
over `src/lib` on top of both. `docs/` is deploy notes, the constitution, GTM
docs, and dated design history; `scripts/` holds the demo-video generator;
`public/` is static assets served as-is.
`AGENTS.md`/`CLAUDE.md`/`FUTURE.md` and `.claude/` together form the AI-agent
harness described in `AGENTS.md`'s own "AI Harness" section; `.husky/` is the
git-hook layer that harness relies on for commit-time
enforcement (format/lint/typecheck/lockfile/secret-scan/README-coupling on
`pre-commit`, Conventional Commits on `commit-msg`, harness-integrity +
`pnpm run check && pnpm test` on `pre-push`); `.gitleaks.toml` configures the
secret-scan both husky and `.github/workflows/security.yml` use.
`.github/workflows/` runs the same checks (`pnpm check`, `pnpm test`,
`pnpm build`, e2e, RLS, security scans) that `package.json`'s scripts define
locally.
