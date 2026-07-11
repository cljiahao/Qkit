# QKit Audit — Sweep 2 (multi-axis) — Findings

**Date:** 2026-07-02
**Method:** 6 parallel read-only agents on **orthogonal axes** (not the file-area split of the 2026-07-01 sweep): trust-boundary (edge→DB), money invariant (end-to-end), concurrency/latency (event scale), type/dead/schema-drift (SQL↔TS), resilience/a11y/idempotency, dedupe/abstraction. Each adversarial (construct a concrete failure or drop it) and cross-referencing the 2026-07-01 baseline (S/L/D/B/P/T ids). All findings cite `file:line`.
**Context:** pre-launch, no vendors — free to make the correct structural fix.

## Why this sweep found new things

The 2026-07-01 audit split by **file area**, so it reasoned about "the anon order path." The Phase A rebuild then hardened that path — but only for the `anon` role. Following the **trust boundary** and the **role/grant model** (a different axis) exposed that the identical holes remain open for `authenticated`. Likewise, following the **money invariant** end-to-end (source→stats→API) found a margin bug no single-file view shows, and following **user navigation** found a dead route the route-move left behind.

---

## P1 — must fix

### F1. `authenticated` role bypasses the entire Phase A hardening (CONFIRMED, 2 lenses)

Phase A's revokes are all `anon`-only; the permissive policies have no `TO` clause so they still apply to `authenticated`, whose default table grants were never revoked. **Sign-up is open** (`auth.signUp`), so `authenticated` is an attacker-reachable credential. Verified statically (grep: only `REVOKE … FROM anon`, no `FROM authenticated` anywhere; policies are `WITH CHECK (true)` / `USING(booth_servable(id))` with no role scope).

- **F1a — forge/flood orders.** `orders_public_insert … WITH CHECK (true)` (`0001:98`) + only `REVOKE INSERT … FROM anon` (`0030:158`). A logged-in JWT `POST`s to `/rest/v1/orders` with arbitrary `booth_id`, `total_cents:0`, `status`, forged `items`/`cost_cents` — skipping `place_order` entirely. The 0032 freeze trigger is **BEFORE UPDATE only**, so INSERT-time forgery is unguarded. (STILL-OPEN(S1) for authenticated.)
- **F1b — read every booth's secrets.** `booths_public_read USING (booth_servable(id))` (`0016:49`) + only `REVOKE SELECT … FROM anon` (`0029:44`). Any vendor reads every _other_ servable booth's `cost_cents` (margins) and live `short_code` (defeats QR rotation → order-spam). (STILL-OPEN(S2) for authenticated; the `access_token` half is fixed — column dropped.)
- **F1c — forge feedback.** `feedback_public_insert … WITH CHECK (true)` (`0018:22`), no grant revoked from either role. Inject fake 1★ reviews on a competitor's booth; pollute admin NPS. (NEW — S1 pattern on `feedback`.)
- **F1d — burn order numbers.** `next_order_number` EXECUTE revoked from anon only (`0030:159`); it's SECURITY DEFINER with no ownership check → authenticated burns any booth's `order_seq`. Also now dead in prod (place_order inlines numbering). (STILL-OPEN(S3) for authenticated.)

**Fix (migration 0033):** these permissive policies are now **dead for the app** (anon uses the SECURITY DEFINER RPCs; authenticated vendors read their own booths via the owner policy and never insert orders/feedback directly). Drop them and revoke the residual `authenticated` grants: `DROP POLICY orders_public_insert / booths_public_read / feedback_public_insert`; `REVOKE INSERT ON orders, feedback FROM authenticated`; `REVOKE SELECT ON booths FROM authenticated`; `REVOKE EXECUTE ON next_order_number FROM authenticated` (or drop it — dead). Route the anon feedback insert through a SECURITY DEFINER RPC (mirror `place_order`). Add pgTAP: act as authenticated vendor B, assert cannot INSERT an order, cannot SELECT vendor A's booth `short_code`/`cost_cents`, cannot insert feedback.

### F2. Gross-margin shown as 100% for every no-cost vendor, incl. the external API contract (CONFIRMED)

`place_order` always persists `cost_cents` on each line (`v_cost := COALESCE(…,0)`, `0030:111,117`), so it's never `null` — only `0`. The stats guard `if (item.cost_cents != null) anyCost = true` (`stats.ts:255`) is therefore always true → `grossMargin` always non-null → for a vendor who entered no costs, `profit == revenue`, `marginPct == 100`. Surfaces in the dashboard `MarginTable`, the **frozen** `SalesSummaryV1.gross_margin` API (`api/v1/sales/summary/route.ts:69` — consumed by sibling `-kit`s), and the CSV export. The masking test (`stats.test.ts:313`) passes only because it _omits_ `cost_cents` — a shape `place_order` never emits.
**Fix:** omit `cost_cents` in `place_order` when the menu item has none, OR gate on `cost_cents > 0` in `computeStats`. Update the masking test to the real row shape.

### F3. Dead `/order/[boothId]` entry route — vendor share link + reorder 404 (CONFIRMED, regression from Phase A)

Phase A moved the entry page to `/o/[code]` and removed `src/app/order/[boothId]/page.tsx` (dir now has only `[orderNumber]/`). Live consumers still push to `/order/{boothId}`:

- `dashboard/booths/booth-list.tsx:21` — **"Copy order link"** copies `${origin}/order/${id}` → a vendor sharing it (WhatsApp/IG/flyer) hands out a dead link.
- `reorder-button.tsx:37` and the receipt "Order again" link (`[orderNumber]/page.tsx:155`) → 404.

Compounding: reorder can't reach `/o/{code}` because the status page knows only `boothId`, not the rotating `short_code`.
**Fix:** repoint "Copy link" + reorder to `/o/{short_code}`; resolve booth→current code server-side (the dashboard already has the booth's `short_code`; the status page needs a lookup) OR add a `/order/[boothId]` → current-`/o/{code}` redirect shim (also preserves any already-printed old links). Decide: redirect shim is the more resilient choice.

### F4. Stock oversell race in `place_order` (HIGH confidence static; magnitude needs a load test)

The stock gate reads `booth_remaining_stock()` (`0030:69`) **before** the per-booth `order_seq` row lock (`0030:126`), and the sold counter is bumped only in the AFTER-INSERT trigger. Under READ COMMITTED, two concurrent last-unit orders both read `remaining=1`, both pass, both insert → oversells a capped item by (racers−1). The in-function comment only defends the intra-order duplicate-line case.
**Fix:** enforce stock **after** taking the `order_seq` lock (or `SELECT … FOR UPDATE` the `booth_item_sold` rows) so the check and the increment are serialized.

---

## P2 — should fix

- **F5 (L2)** `check_rate_limit` inline unindexed `DELETE` on every hot-path call; PK doesn't lead on `window_start` (`0017:43`). → index `window_start` + move cleanup to cron.
- **F6 (L4)** Status page two serial awaits (order, then booth) (`[orderNumber]/page.tsx:25-38`) — highest-volume read after the menu. → `Promise.all`. (Note: 2026-07-01's "folded into place_order" was wrong — that's the write path.)
- **F7 (L6)** Two independent 5s pollers on the same order row (`order-status-poller.tsx` + `pay-panel.tsx`). → one query + shared `usePolling` hook.
- **F8 (L7)** `revalidate = 0` on `/o/[code]` (`page.tsx:11`) — thundering herd on the hottest read. → short cache tag on the static catalog, keep stock/servable live.
- **F9 (L9)** Dashboard double auth+vendor fetch per request; zero `React.cache()` in `src`. → memoize `getVendor`/`getUser` with `cache()`.
- **F10 (NEW)** `revalidatePath('/dashboard')` on every advance/confirm/cancel (`order-actions.ts:68,98,121`) is redundant with realtime and re-triggers the uncached L9 fetch. → drop or scope it.
- **F11 (P6)** No `global-error.tsx` — root-layout errors render Next's unstyled page.
- **F12 (P6)** No `aria-live` on the live status text (`order-status-poller.tsx:201`) and pay-panel (NEW) — the "ready for pickup" change is silent to screen readers (WCAG 4.1.3).
- **F13 (P6)** Option-choice buttons color-only, no `role="radio"`/`aria-checked` (`item-customizer.tsx:137`) — `feedback-form.tsx` already has the correct pattern to copy (WCAG 1.4.1/4.1.2).
- **F14 (B5)** Storage orphans: `image-uploader` never deletes replaced/removed objects; `deleteBooth` leaves images; `booth-images` bucket has no `file_size_limit`/`allowed_mime_types` (app-only guard bypassable via direct Storage API).

## P3 — worth doing

- **F15** Sibling UPDATE policies missing `WITH CHECK` (same class as the fixed B2): `vendors_self_update` (`0001:70`), `booths_vendor_update` (`0003:19`), `purchase_requests_admin_update` (`0021:28`).
- **F16 (T1)** `payment_method_kind` is unconstrained `TEXT`; Row types it `PaymentKind|null` but it's forgeable via direct `booths` PATCH. → add `CHECK (… IN ('pointer','paynow','stripe'))`.
- **F17** `advanceOrder`/`cancelOrder` update by `id` with no current-status guard (status isn't frozen) → cancel↔advance race can resurrect a cancelled order into revenue+stock. → add `.eq("status", expected)` optimistic guard.
- **F18** `cancelOrder` doesn't clear `payment_status`; a confirmed-paid then-cancelled order drops from revenue with no refund trail. → decide refund/negative-revenue semantics.
- **F19** `can_create_booth` (`0010:64`) checks `expires_at > now()` but not `valid_from <= now()` — inconsistent with every other window check.
- **F20** `setVendorPlan(pro, amount>0)` resubmission inserts duplicate `payments` rows → QKit revenue double-counts (`admin/actions.ts:53`). → idempotency/guard.
- **F21 (L8)** RLS bare `auth.uid()` → `(select auth.uid())` systematically.
- **F22 (L11)** Admin unbounded full-table scans (`admin/page.tsx:63`). → bound by date / aggregate in SQL.
- **F23** Dead `order_status` values `'pending'`/`'confirmed'` + unreachable `DEFAULT 'pending'` (place_order always inserts `'preparing'`). Cosmetic; keep in tolerant read schema.
- **F24** `apply_order_stock_delta` keeps default PUBLIC EXECUTE (harmless — nested write fails as caller — but inconsistent). → `REVOKE ALL … FROM PUBLIC`.
- **F25 (T2)** `types.ts` still omits `rate_limits` table + `is_admin`/`can_create_booth`/`apply_order_stock_delta` functions (partial mirror). (`booth_item_sold` + Phase A functions now present — that part of T2 is fixed.)
- **F26 (NEW)** Payment-QR `<img>` (`pay-panel.tsx:110`) has no `onError` fallback — broken image on flaky Wi-Fi with no retry; customer can't pay.
- **F27 (P6)** Menu +/- buttons missing `aria-label` (`order-form.tsx:296`); cart controls already have them.

## Cleanup / dedupe (verified against D1–D12)

Worthwhile, ranked by drift-risk × payoff:

- **D2** rate-limit XFF block in 3 live copies (incl. a NEW Phase-A one) → `lib/rate-limit.ts` (`clientIp` + `rateLimit`). **Unblocks S4/F5-adjacent trusted-proxy fix — do this before touching rate limiting.**
- **D7** two ~35-line pollers + two one-field reads → `use-polling.ts` + `getOrderField` (largest raw dup; overlaps F7).
- **D3** bare `z.string().uuid()` in 7+ sites (2 NEW from A/B2) → `uuidSchema` in `lib/schemas.ts`.
- **D4** cents→dollar-string ×6 + 3 divergent dollars→cents → `centsToDollarString` in `lib/utils.ts`.
- **D1** dashboard layout hand-rolls a 3rd vendor gate → call `getVendor()` + `cache()` (overlaps F9).
- **D5** `Delta`/stat-card dup → `components/stat-card.tsx`. **D6** `RANGE_DAYS`+windowed fetch → `lib/stats-range.ts`. **D9** order-line ticket JSX ×2 → `OrderSummaryTicket`. **D10/D11** minor.
- **D12** `booth_servable` SQL vs `booth-access.ts` TS — no coupling test; latent free-tier drift → add a coupled cross-check test (not code merge).
- **DROP D8** (toast-on-ActionResult "×9") — over-abstraction: shared part is 2 lines, every success branch differs. Leave inline.

---

## Verified ALREADY-FIXED (not re-reported)

Client-price trust / server re-pricing, B1 idempotency, B2 vendor freeze+WITH CHECK, payment lifecycle legality, currency formatting + B3, revenue cancelled-exclusion + no cross-booth double count, L1 stock counter, L10 react-query removed, all SECURITY DEFINER search_path pinned, RLS enabled on every table, realtime publication scope, service-role call sites all server-only + narrow, OAuth callback no open-redirect.

## Proposed sequencing

1. **Phase A.1 (urgent security):** F1 (authenticated lockdown, migration 0033 + pgTAP) — same class as the whole Phase A, just the other role. Do first.
2. **P1 correctness:** F2 (margin), F3 (dead route), F4 (oversell race).
3. **Phase B (revised):** F5–F14 (latency + a11y + resilience) — fold D2/D7/D1/D9 dedupe in where they overlap (F5/F7/F9).
4. **Phase C:** remaining P3 (F15–F27) + remaining dedupe (D3/D4/D5/D6/D10/D11/D12).
5. **Phase D:** coverage + CI e2e (unchanged from the 2026-07-01 roadmap).
