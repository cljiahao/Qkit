# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- One-tap **reorder**: customers can repeat a past order from the order-status
  page or their recent-orders list; the cart is rebuilt against the live menu
  (current prices, removed/changed items skipped). Recent-orders list collapses
  to 3 with "Show all".
- **Per-event permanent stats**: a paid pass (license) can be named after the
  event day and its full stats stay viewable forever — ungated, since it was
  paid for (migration `0020` + `set_license_label` RPC).
- **Customer reviews for vendors**: a "Customer reviews" card on `/dashboard/stats`
  shows average rating, distribution, and recent comments **split per booth**,
  each comment timestamped, with "show more" paging (RLS now lets a vendor read
  their own booths' customer feedback). Per-event stats include that event's
  reviews, and a prominent "Feedback" nav button surfaces the QKit feedback page.
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

- Mobile dashboard nav collapses behind a **burger menu** (the bar overflowed on
  phones); the vendor NPS form is now an even 0–10 scale that fits any width.
- Customer menu photos are **tap-to-enlarge** (fullscreen lightbox, Esc/tap to
  close) with a subtle corner expand icon + zoom-in cursor as the affordance.
- "Get a pass" / "Go monthly" now file an in-product **upgrade request** to the
  admin (migration `0021` + `purchase_requests`) instead of opening a `mailto:`
  to a personal inbox. The admin Overview shows a pending-requests inbox with a
  Resolve action; granting a pass/Pro auto-resolves the vendor's request.
- Pagination everywhere (new reusable `Paginated`): admin tables (vendors, audit
  log, per-vendor CSAT) get prev/next pages; feeds (recent orders, reviews, NPS
  notes) get "Show more / Show less". Every expander now collapses back. Per 2026
  UX consensus (pagination for tables, load-more for feeds).
- Reorder lives only on the order page (not the recent-orders list): the list
  shows no items to reorder _from_, and this also removes the inconsistency where
  only orders placed after the snapshot feature had a reorder button.
- Admin revamp: tabbed into **Overview · Vendors · Feedback** (vendors moved to
  their own tab). Cards adopt QKit's ticket/receipt motif (perforated hero,
  Space Mono figures, staggered reveal). Overview adds a **GMV** card (customer
  spend flowing through booths — the marketplace's throughput). Admin **feedback**
  drops the raw per-order customer feed (vendor-facing); it tracks **vendor NPS**,
  an **aggregate platform CSAT**, and a **per-vendor CSAT breakdown** (worst-rated
  first) to surface ordering-quality issues — scores only, no raw reviews.
- Vendor → QKit feedback is **NPS** (0–10 "recommend QKit?") instead of 1–5
  stars (migration `0019` adds the `nps` column).
- Fixed the stats/admin trend chart: dated X-axis (was a hidden index) and an
  uncut Y-axis (was clipped by a negative margin + 28px width).
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
