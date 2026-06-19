# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- AI harness governance: `docs/constitution.md` (inviolable rules — RLS-is-authz,
  service-role server-only, Zod boundaries, deny-rules-are-a-guardrail).
- Project skills `/security-scan` (local gitleaks + `pnpm audit`) and `/changelog`;
  scoped `allowed-tools` on all project skills.
- pgTAP RLS isolation test (`supabase/tests/rls.test.sql`, run via
  `supabase test db`) — asserts a vendor cannot read or mutate another's data.

### Security

- CI security scanning (`.github/workflows/security.yml`): gitleaks v3 secret
  scan, CodeQL (javascript-typescript, security-extended), and a `pnpm audit`
  high/critical gate.
- `.github/dependabot.yml`: security-updates only (npm + github-actions);
  version-update PRs disabled (`open-pull-requests-limit: 0`).
- Removed `axios` — an unused production dependency carrying a high-severity
  `form-data` advisory (GHSA-hmw2-7cc7-3qxx). Production `pnpm audit` is clean at
  the high gate. The audit gate runs `--prod` (shipped code); a full audit runs
  informationally (dev-toolchain transitive vulns tracked by Dependabot).

### Changed

- Permissions are now max-privilege: bare-tool `allow` so routine work doesn't
  prompt, with a `deny` list scoped to secret reads/edits and irreversible git/fs
  ops (force-push, hard reset, `rm -rf`, history rewrite). `.env.example` is the
  only whitelisted env file.
- De-branded docs layout: `docs/superpowers/{specs,plans}` → `docs/{specs,plans}`.
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
