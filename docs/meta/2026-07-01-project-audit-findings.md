# qkit Project Audit — Findings & Remediation Roadmap

**Date:** 2026-07-01
**Method:** 5 parallel read-only area sweeps (src/lib, order/latency, dashboard/actions, DB/RLS/indexes, cross-cutting dedupe) + a 2nd sweep (adversarial verification of DB criticals + completeness critic). All findings cite `file:line`.
**Context:** Project is pre-launch (no vendors) — free to make the _correct_ structural change rather than the backward-compatible one.

---

## ⚠️ Headline

**The entire customer write path is enforced only in the Next.js app layer; Postgres trusts the public anon key completely.** The anon/publishable key is inlined into every browser bundle (`src/lib/supabase/client.ts`), and PostgREST exposes tables per RLS. All five DB criticals below are **CONFIRMED** exploitable via a direct PostgREST call that skips the app. This means the QR-token feature just shipped **is bypassable at the DB layer** — the fix is to move enforcement into the database.

---

## P0 — Security (CRITICAL, confirmed)

- **S1 — `orders_public_insert WITH CHECK (true)`** (`supabase/migrations/0001_initial_schema.sql:98-99`). Anon can POST directly to `/rest/v1/orders` with an arbitrary `booth_id`, `status:'completed'`, `total_cents:0`, and forged `items`/`cost_cents` — bypassing `check_rate_limit`, `access_token`/`isTokenValid`, `booth_servable`, and the stock check (all app-only, `actions.ts:40-106`). No BEFORE INSERT trigger exists. Also lets anon order from paused/inactive booths and forge the "frozen cost snapshot."
- **S2 — `booths_public_read` leaks `access_token` + `cost_cents`** (`0016_booth_serveability.sql:48-50`). RLS is row-level; it cannot hide columns. Anon can `select=access_token,menu_items` on any servable booth and read the current QR token (defeating rotation) and vendor cost. App-layer stripping (`order/[boothId]/page.tsx:52-54`) does nothing for a direct PostgREST call. No view/column-grant intercepts it.
- **S3 — `next_order_number` granted to anon, unguarded** (`0008_atomic_order_numbers.sql:29-52`). Direct RPC call burns a booth's `order_seq` (confusing gaps) with no rate/ownership check.
- **S4 — Spoofable rate-limit identity** (`order/[boothId]/actions.ts:53-56`, `actions/feedback.ts:28-31`, `payment-actions.ts:57-60`). Key derives from client-settable `X-Forwarded-For` with no trusted-proxy check; documented `TRUST_PROXY` env var is **dead** (zero usages). Any client rotates its XFF to get a fresh bucket, defeating the flood guard.
- **B2 (vendor-side integrity) — client-mutated orders + missing `WITH CHECK`** (`src/components/order-card.tsx:92-141`, `orders_vendor_update` at `0001:91-96` has `USING` but no `WITH CHECK`). The vendor order/payment state machine runs entirely in browser React with no server action, no Zod, no column restriction — a tampered vendor session can set any `orders` column (status, `total_cents`, `payment_status`) on its own orders.

**These converge on one clean redesign** (see Phase A): a single `SECURITY DEFINER` order-placement RPC keyed on the rotating short code, with direct anon INSERT and sensitive-column reads revoked.

## P1 — Latency at event scale

- **L1 — `booth_remaining_stock` recomputes over full order history**, uncached, **twice per customer** (`0010_monetization.sql:80-112`; called `order/[boothId]/page.tsx:34` + `actions.ts:80`). Cost grows with cumulative event orders. → incremental `stock_sold` counter (insert trigger) or bounded window.
- **L2 — `check_rate_limit` inline unindexed `DELETE`** every call (`0017_rate_limit.sql:43-44`; PK `(key, window_start)` doesn't lead on `window_start`) → full scan on every order/feedback/payment. → index `window_start` + move cleanup to cron.
- **L3 — `next_order_number` per-booth row lock** serializes concurrent submits per booth (`0008:38-41`). Inherent to gapless numbering; note as the systemic ceiling.
- **L4 — Status page serial awaits** (`order/[boothId]/[orderNumber]/page.tsx:25-38`) — independent orders+booths selects; parallelize (highest-frequency read).
- **L5 — `check_rate_limit` awaited before the parallel batch** (`actions.ts:57-82`) — folds away in the Phase A RPC.
- **L6 — Two 5s polls (status + payment) hit the same row** (`order-status-poller.tsx` + `pay-panel.tsx`) → one query, one shared `usePolling` hook.
- **L7 — `revalidate = 0` on order pages** (`order/[boothId]/page.tsx:12`) — thundering-herd of same-booth scans each re-runs all queries. Short cache on the static booth catalog (keep stock/servable live).
- **L8 — RLS uses bare `auth.uid()`** everywhere (not `(select auth.uid())`) — Supabase planner can't cache it per-row. Fix systematically.
- **L9 — Dashboard double auth/entitlement fetch** (`dashboard/layout.tsx:13-27` + every page's `requireEntitledVendor`) → React `cache()` per-request memoization.
- **L10 — Unused `@tanstack/react-query`** shipped to every client bundle (`providers.tsx`; zero `useQuery` call sites) → remove until used.
- **L11 — Admin dashboard unbounded full-table scans** (`admin/page.tsx:63-64`) → bound by date / aggregate in SQL.

## P2 — Duplication / debt

- **D1** — vendor auth gate implemented 3× (`get-vendor.ts`, `get-entitlement.ts`, `dashboard/layout.tsx`); collapse to one, memoized.
- **D2** — rate-limit boilerplate ×3 → `lib/rate-limit.ts` (order path absorbed by Phase A RPC; feedback/payment remain).
- **D3** — `z.string().uuid()` boothId schema redeclared ×5 → shared `boothIdSchema` in `lib/schemas.ts`.
- **D4** — cents→decimal string reimplemented ×5 + `dollarsToCents` dup → `centsToDollarString` in `lib/utils.ts`.
- **D5** — `Delta`/stat-card components duplicated (`admin/stat.tsx` vs `stats/kpi-row.tsx`) → shared `components/stat-card.tsx`.
- **D6** — `RANGE_DAYS` + windowed stats-order fetch duplicated (`api/v1/sales/summary/route.ts` vs `stats/page.tsx`) → `lib/stats`.
- **D7** — `getOrderStatus`/`getPaymentStatus` + poll loops duplicated → merge query + `usePolling` hook.
- **D8** — toast-on-`ActionResult` submit pattern ×9 → `useActionResult` hook.
- **D9** — ticket-total + order-line JSX duplicated ×3 (`order-card.tsx`, `order-form.tsx`, `[orderNumber]/page.tsx`) → shared `OrderSummaryTicket`.
- **D10** — read/write Zod fragments duplicated (`menuItemSchema`/`menuItemFormSchema`, order-line) → shared base + `.extend()`.
- **D11** — ISO-parse-guard idiom ×5 → `safeParseMs` in `tz.ts`.
- **D12** — `booth_servable` (SQL) vs `servableBoothIds`/`booth-access.ts` (TS) hand-duplicated with no cross-check → add a coupled test.

## P3 — Bugs

- **B1 — `placeOrder` retry has no idempotency key** (`order-form.tsx:182-193`) — a committed-but-connection-dropped insert double-orders on flaky event Wi-Fi. Add an idempotency key (client-generated, unique index) — fold into Phase A.
- **B3 — `parseDollarsToCents` accepts `"Infinity"`** (`lib/utils.ts:31-39`; missing `Number.isFinite`).
- **B4 — `takeReorder` casts weakly-validated `sessionStorage`** (`reorder-handoff.ts:34-41`) — validate line shape like `recent-orders.ts` does.
- **B5 — `image-uploader` orphans storage objects** (`image-uploader.tsx`) — replaced/removed images never deleted from the bucket.

## P4 — Coverage gaps

- No tests: `saveBooth` (entitlement caps — most complex dashboard logic), all `admin/actions.ts` (revenue/license), `onboarding/actions.ts` `createVendor` (incl. `23505`-as-success), full `placeOrder` path (stock/rate/payment snapshot), `stats/actions.ts` `renameEvent`.
- Lib: `image-resize.ts`, `get-entitlement.ts`, `middleware.ts`, `csvCell` escaping branches, `paynow` truncation branch, `booth-color` hash distribution.
- **C2 — e2e not in CI**: only `auth-guard.spec.ts` runs; `customer-order` + `qr-token` (the actual critical paths) need seeded Supabase and run nowhere automated.
- **C3 — `/admin` anon-redirect untested** in `auth-guard.spec.ts`.

## P5 — Correctness / type / dead

- **T1** — `orders.payment_method_kind` typed `PaymentKind|null` on Row but `string|null` on Insert/Update; column is unconstrained `TEXT` (`types.ts:394/410/426`, `0024`). Align (add CHECK or unify type).
- **T2** — `types.ts` omits `rate_limits` table and Functions `can_create_booth`/`is_admin`/`gen_booth_token` — incomplete mirror.
- **Dead**: `order_status` enum `pending`/`confirmed` never set (legacy); `paynow.mobile` branch unreachable from UI (and UEN edit silently drops it); unused re-exported row aliases (`types.ts:483-490`).

## P6 — a11y / error UX

- No `global-error.tsx` (root-layout errors → unstyled default page).
- No `aria-live` on the live order-status text (`order-status-poller.tsx:200-213`) — the key customer state change is silent to screen readers.
- Menu +/- buttons missing `aria-label` (`order-form.tsx:292-311`; cart controls below have them).
- Option-choice buttons lack `role="radio"`/`aria-checked`/`aria-pressed` (`item-customizer.tsx:137-149`) — selection is color-only.

## P7 — Config

- **`.prettierignore` / eslint `ignores` drift from `.gitignore`** — `scripts/demo/out/steps.json` (+ coverage/test-results/playwright-report) aren't excluded, so `pnpm check` spuriously fails for anyone who ran the demo recorder/coverage/e2e. (This is the pre-existing `pnpm check` failure seen during the QR-token work.)

---

## Proposed phased remediation

**Phase A — Order path hardening (DB-enforced ordering + dynamic-QR short code + hot-path latency).** The flagship; merges Stream 2 (dynamic QR short code) with the P0 security rebuild because they are the same code path:

- Rotating **short code** becomes the sole public capability (`/order/{shortCode}`), resolved server-side. QR shrinks to ~30 chars (best practice) and the `access_token`/UUID never appear in the client URL.
- A single **`SECURITY DEFINER place_order(...)` RPC** does token/servable/hours/stock/rate-limit/number-allocation/insert **atomically in the DB**; revoke direct anon `INSERT` on `orders` and anon `EXECUTE` on `next_order_number`. Fixes S1, S3, B1 (idempotency key), L4/L5.
- Public booth read via a **SECURITY DEFINER function / security-barrier view** returning only public-safe menu (no `cost_cents`, no `access_token`); revoke anon column access. Fixes S2.
- `booth_remaining_stock` → incremental counter (L1). `rate_limits` index + cron cleanup (L2). Short-code lookup indexed.

**Phase B — Integrity + quick wins.** order-card → server action + `WITH CHECK` on `orders_vendor_update` (B2); `TRUST_PROXY` (S4); `.prettierignore` drift (P7); remove react-query (L10); small bugs B3/B4/B5; `global-error.tsx` + a11y (P6); RLS `(select auth.uid())` (L8); admin query bounding (L11).

**Phase C — Dedupe pass.** D1–D12 (auth gate, boothIdSchema, cents, components, usePolling, useActionResult, schema fragments, ISO parse, stats fetch, booth_servable cross-check).

**Phase D — Coverage + CI.** P4 tests; e2e in CI with seeded Supabase (C2/C3); type/dead cleanup (P5).

Each phase gets its own spec → plan → implementation cycle. Phase A is specced next.
