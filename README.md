# QKit

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

- `AGENTS.md`
- `CHANGELOG.md`
- `CLAUDE.md`
- `FUTURE.md`
- `components.json`
- `docs/`
- `e2e/`
- `eslint.config.mjs`
- `next.config.ts`
- `package.json`
- `playwright.config.ts`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `postcss.config.mjs`
- `public/`
- `scripts/`
- `src/`
- `stryker.conf.json`
- `supabase/`
- `test/`
- `tsconfig.json`
- `vercel.json`
- `vitest.config.ts`

### Connectivity

`src/` is the Next.js app itself; `supabase/` holds the Postgres schema and RLS
policies it depends on, applied via the Supabase CLI or SQL Editor. Two
separate test layers sit alongside it: `e2e/` (Playwright, against a real
local Supabase) and `test/` (Vitest, for API routes not colocated with their
source). `docs/` is dated design history from past work; `scripts/` holds the
demo-video generator; `public/` is static assets served as-is.
