# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Upgraded Next.js 15 → 16.2.7 (Turbopack). Renamed `src/middleware.ts` →
  `src/proxy.ts` (`export proxy`); switched the `check` script from `next lint`
  (removed in 16) to the ESLint CLI with `eslint-config-next`'s flat config.

## [0.1.0] - 2026-06-05

### Added

- Supabase email/password auth — login and register (creates the vendor row).
- Database schema (`supabase/migrations/0001_initial_schema.sql`): `vendors`,
  `booths` (JSONB `menu_items`), `orders` (JSONB `items`, `order_status` enum),
  with `updated_at` trigger.
- Row Level Security: vendors see/edit only their own booths and orders; active
  booths are publicly readable; anyone may place an order.
- Supabase realtime publication on `orders`.
- Vendor dashboard (`/dashboard`) — realtime order board; tap a card to advance
  status; auth-guarded via `src/middleware.ts`.
- Customer ordering page (`/order/[boothId]`) — menu, cart, and `placeOrder`
  server action with order-number generation.
- Live order status page (`/order/[boothId]/[orderNumber]`) with a realtime
  status poller (reads via the service-role client).
- shadcn/ui (new-york) primitives; `cn` / `formatPrice` / `genOrderNumber` utils
  with tests.
- AI harness: `AGENTS.md`, `.claude/` (settings hooks, project skills, verify
  gate, manifest), `vitest.config.ts`.

### Changed

- Upgraded `@supabase/ssr` 0.6 → 0.10 for `@supabase/supabase-js` 2.107 type
  compatibility (older ssr made every typed query resolve to `never`).

[Unreleased]: https://github.com/cljiahao/Qkit/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/cljiahao/Qkit/releases/tag/v0.1.0
