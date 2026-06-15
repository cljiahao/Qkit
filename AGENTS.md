<!-- templateCentral: nextjs@5.0.0 (Supabase variant — NOT better-auth/Drizzle) -->

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
src/app/(auth)/                 — login + register (Supabase email/password)
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
  (ssr 0.10.x ↔ supabase-js 2.10x) or every query degrades to `never`.
- After editing the schema, update both `supabase/migrations/` and `src/lib/types.ts`
  (or run `supabase gen types typescript` once the CLI is installed).

## Skills

### Project skills — check here first (`.claude/skills/`)

| Skill               | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `/next-verify`      | typecheck + lint + test in one pass                          |
| `/supabase-migrate` | apply `supabase/migrations` + regenerate types (safety gate) |

### templateCentral plugin skills

templateCentral has **no Supabase support** (auth=better-auth, db=Drizzle/Kysely/Mongoose,
no realtime). Use only the stack-agnostic ones here:
| Skill | When to use |
|-------|-------------|
| `templatecentral:standards` | naming/validation drift check |
| `templatecentral:audit` | structural audit (expect Supabase-vs-tc drift findings) |

Do **not** run `templatecentral:add (auth)` or `(database)` — they install
better-auth / Drizzle and will break RLS + realtime.

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
`permissions.deny`: blocks **reading** `.env*` and `./secrets/**` (Edit/Write
of secrets already blocked by PreToolUse).
Project skills (directory form, `<name>/SKILL.md`): `.claude/skills/` |
Manifest: `.claude/harness.json`

## Skills Security

- Review `SKILL.md` before installing any third-party skill — treat skills like packages.
- Scope `allowed-tools:` to the minimum (e.g. `Bash(git *)` not `Bash`).
- Never install skills that hardcode secrets or make unlisted outbound calls.

## Project-Specific Notes

- Plan of record: `docs/superpowers/plans/2026-06-05-qkit-core.md`.
- Migrated 15→16 on 2026-06-05 (`middleware.ts`→`proxy.ts`, `next lint`→eslint CLI).
<!-- [[post-harness]] — reserved for trace capture and meta-harness integration -->
