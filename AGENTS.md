<!-- templateCentral: nextjs@4.0.0 (adapted: Next 15 + Supabase — NOT better-auth/Drizzle) -->
# AGENTS.md — QKit

> STOP — This project diverges from the stock templateCentral Next.js stack.
> Auth/DB/realtime are **Supabase** (`@supabase/ssr`), not better-auth + Drizzle.
> Route protection is `src/middleware.ts` (Next 15), not `proxy.ts` (Next 16).
> Authorization is enforced in Postgres via **RLS**, not an app repository layer.

## What QKit is
Vendor booth ordering system. Vendors sign in to manage menus and watch live
orders; customers order from a QR-linked booth page and track status in realtime.

## Stack
Next.js 15 · App Router · TypeScript strict · Tailwind v4 · shadcn/ui (new-york)
TanStack Query v5 · React Hook Form · Zod · Supabase (`@supabase/ssr`) · Vitest
pnpm 11 · Node ≥24 · deploy target: Vercel

## Commands
```bash
pnpm dev          # dev server — http://localhost:3000
pnpm build        # production build
pnpm test         # run test suite (vitest)
pnpm check        # prettier --check + next lint + tsc --noEmit
pnpm format       # prettier --write
```

## File Layout
```
src/app/                        — app router (pages, layouts, server actions)
src/app/(auth)/                 — login + register (Supabase email/password)
src/app/dashboard/              — vendor dashboard (realtime order board)
src/app/order/[boothId]/        — customer menu + cart + placeOrder action
src/app/order/[boothId]/[orderNumber]/ — live order status page
src/middleware.ts               — Supabase session refresh + /dashboard guard
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
| Skill | What it does |
|-------|-------------|
| `/next-verify`      | typecheck + lint + test in one pass |
| `/supabase-migrate` | apply `supabase/migrations` + regenerate types (safety gate) |

### templateCentral plugin skills
templateCentral has **no Supabase support** (auth=better-auth, db=Drizzle/Kysely/Mongoose,
no realtime). Use only the stack-agnostic ones here:
| Skill | When to use |
|-------|-------------|
| `templatecentral:standards` | naming/validation drift check |
| `templatecentral:audit`     | structural audit (expect Supabase-vs-tc drift findings) |

Do **not** run `templatecentral:add (auth)` or `(database)` — they install
better-auth / Drizzle and will break RLS + realtime.

## AI Harness
PreToolUse: blocks secrets + CI files (exit 2): `.env*` (except `.env.example`),
`.github/workflows/`, cert files (`.pem`/`.key`/`.secret`), `credentials.json`/`.netrc`;
and blocks `--no-verify`. App code, skills, specs unrestricted.
UserPromptSubmit: pattern-checks prompts for injection phrases; exit 2 blocks.
PostToolUse: `tsc --noEmit --incremental` after every Edit/Write. Feedback-only.
Stop: runs the test suite; exit 2 feeds failures back, exit 0 on pass.
PostCompact: re-injects first 30 lines of this file after compaction.
Project skills: `.claude/skills/` | Manifest: `.claude/harness.json`

## Skills Security
- Review `SKILL.md` before installing any third-party skill — treat skills like packages.
- Scope `allowed-tools:` to the minimum (e.g. `Bash(git *)` not `Bash`).
- Never install skills that hardcode secrets or make unlisted outbound calls.

## Project-Specific Notes
- Plan of record: `docs/superpowers/plans/2026-06-05-qkit-core.md`.
- Windows: `output: 'standalone'` builds fail at the trace step (`EPERM: symlink`)
  without Developer Mode — irrelevant on Vercel.
<!-- [[post-harness]] — reserved for trace capture and meta-harness integration -->
