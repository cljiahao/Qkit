# QKit — Master Task Registry (consolidated, 2026-07-02)

Consolidates **three audit sweeps** + dependency/CVE scan + toolchain into one prioritized backlog.
Sources: `2026-07-01-project-audit-findings.md` (S/L/D/B/P/T), `2026-07-02-audit-sweep-2-findings.md` (F1–F27), sweep-3 agents (coverage N-cov, deps/config, validation V, reuse R, error-handling N-err), `pnpm audit` (clean).

**Each item:** severity (P1 highest → P3) · importance (impact if unfixed) · effort (S<½day / M / L) · category · source ids. Duplicates across sweeps are **merged** (all source ids listed). Already-shipped (Phase A 0027–0031, quick-wins, B2 0032) excluded; re-verified-still-fixed items excluded.

Severity model: pre-launch, no vendors/data → nothing is a live P0. "P1" = do first (security/correctness/revenue-integrity). Not exploitable-in-production-today ≠ safe once launched.

## Counts

| Sev | Security  | Correctness/Money | Latency | Resilience/Err | a11y | Coverage/CI | Dedupe/Reuse | Config/Deps | Total |
| --- | --------- | ----------------- | ------- | -------------- | ---- | ----------- | ------------ | ----------- | ----- |
| P1  | 1 cluster | 3                 | 1       | 1              | –    | 1           | –            | –           | 7     |
| P2  | 1         | 1                 | 4       | 3              | 2    | 1           | 2            | 2           | 16    |
| P3  | 2         | 5                 | 2       | 6              | 2    | 3           | ~10          | 6           | ~36   |

---

## P1 — do first

### T1. Complete the DB enforcement for the `authenticated` role + lock the RPC (SECURITY) — effort M

**The headline. Phase A hardened only `anon`; every gap remains for `authenticated`, and sign-up is open.** Merge of **F1a–d + V1 + V2 + V3 + V6**.

- **F1a** `orders_public_insert WITH CHECK(true)` + only anon INSERT revoked → any logged-in JWT direct-INSERTs forged orders (freeze trigger is UPDATE-only). `0001:98`, `0030:158`.
- **F1b** `booths_public_read` + only anon SELECT revoked → any vendor reads every servable booth's `cost_cents`+`short_code`. `0016:49`, `0029:44`.
- **F1c** `feedback_public_insert WITH CHECK(true)`, no revoke → forge competitor reviews / pollute NPS. `0018:22`.
- **F1d** `next_order_number` EXECUTE revoked from anon only; SECURITY DEFINER, no ownership check → burn any booth's `order_seq` (also dead in prod). `0030:159`.
- **V1** `check_rate_limit` runs only in the server actions, but `place_order` is `GRANT EXECUTE TO anon` → direct RPC call skips the flood guard entirely (unbounded orders). `0030:155`.
- **V2** `place_order` trusts client `items[].name` (only price re-derived) → junk/oversized names into orders + `topItems` stats + API. `0030:115`.
- **V3** `options` never validated against the item's option groups; caps live only in Zod (bypassed on direct RPC). `0030:114`.
- **V6** qty-0-only cart (array len 1) passes the empty-cart check → real $0 order, burned seq. `0030:65,103`.
  **Fix:** migration 0033 — drop the 3 dead permissive policies; `REVOKE INSERT ON orders,feedback / SELECT ON booths / EXECUTE next_order_number FROM authenticated`; route anon feedback insert through a SECURITY DEFINER RPC; **inside `place_order`**: re-derive `name` from menu, validate `options` membership, move the rate-limit check in, reject empty priced cart, cap `jsonb_array_length`. + pgTAP as authenticated non-owner (INSERT order / SELECT other booth `short_code` / feedback all rejected). **Importance: critical** (cross-vendor data + order forgery + flood).

### T2. Gross margin always 100% for no-cost vendors, incl. the frozen external API — effort S — CORRECTNESS/MONEY. **F2**

`place_order` always writes `cost_cents:0` (never null) → `anyCost` guard (`stats.ts:255`) always true → `profit==revenue`, `marginPct==100` in dashboard, `SalesSummaryV1.gross_margin`, CSV. **Fix:** omit `cost_cents` in `place_order` when the item has none, or gate on `>0`; fix the masking test (`stats.test.ts:313`). **Importance: high** — feeds a sibling -kit as truth.

### T3. Dead `/order/[boothId]` route — vendor share-link + reorder 404 — effort M — CORRECTNESS (my Phase A regression). **F3**

Route removed; `booth-list.tsx:21` "Copy order link" and `reorder-button.tsx:37` + receipt "Order again" still point there. Reorder also can't reach `/o/{code}` (status page knows only `boothId`). **Fix:** repoint to `/o/{short_code}` + a `/order/[boothId]` → current-code redirect shim (also rescues already-printed links). **Importance: high** — vendors hand out dead links; reorder feature broken.

### T4. Stock oversell race in `place_order` — effort M — CORRECTNESS/STOCK. **F4 + R4**

Stock gate reads `booth_remaining_stock()` before the `order_seq` lock; counter bumped only in AFTER-INSERT trigger → concurrent last-unit orders both pass. Compounded by **R4**: `apply_order_stock_delta`/backfill/gate clamp negative qty differently. **Fix:** enforce stock after acquiring the lock (or `FOR UPDATE` the counter rows); extract one `order_item_quantities()` with a single clamp rule. **Importance: high** at event scale (selling food you don't have).

### T5. `/api/v1/sales/summary` returns 200-with-zeros on DB read error — effort S — RESILIENCE/CONTRACT. **N-err N1**

Discards `error` on both reads → transient failure yields `{revenue:0,...}` 200. Downstream -kit under-invoices, silently, no log. **Fix:** check `error`, return 503 + `console.error`. **Importance: high** — revenue contract must fail loud.

### T6. Highest-ROI test gaps on the money path — effort S — COVERAGE. **N-cov N5 + N1 + F17-test**

`placeOrder` test covers 1 of 3 `messageFor` branches + skips the rate-limit reject and output-parse-failure; `submitFeedback` untested (F1c surface). **Fix:** extend `actions.place-order.test.ts` (all error prefixes + rate-limit + malformed payload); add `feedback.test.ts`. (Do alongside T1/T2 so the fixes land with tests.) **Importance: high** — the checkout copy + public-insert path have no regression gate.

---

## P2 — should fix

**Security**

- **T7** Sibling UPDATE policies missing `WITH CHECK` (same class as fixed B2): `vendors_self_update` `0001:70`, `booths_vendor_update` `0003:19`, `purchase_requests_admin_update` `0021:28`. effort S. **F15**

**Correctness / money**

- **T8** `advanceOrder`/`cancelOrder` update by `id` with no current-status guard (status not frozen) → cancel↔advance race resurrects a cancelled order into revenue+stock. Add `.eq("status", expected)`. effort S. **F17 + N-err N7** (also log the read error).

**Latency** (all STILL-OPEN from 2026-07-01, re-confirmed)

- **T9** `check_rate_limit` inline unindexed `DELETE` every call → index `window_start` + cron cleanup. effort M. **F5/L2**
- **T10** Status page two serial awaits → `Promise.all`. effort S. **F6/L4**
- **T11** Two 5s pollers on same row → one query + shared `usePolling` hook. effort M. **F7/L6 (+D7,R13)**
- **T12** `revalidate=0` on `/o/[code]` (hottest read) → short cache tag on static catalog, keep stock/servable live. effort M. **F8/L7**
- **T13** Dashboard double auth+vendor fetch; zero `React.cache()` → memoize `getVendor`/`getUser`. effort S. **F9/L9 (+D1)** — also drop the redundant `revalidatePath('/dashboard')` in order-actions (realtime already live). **F10**

**Resilience / observability** (net-new, one-line habit fix each)

- **T14** `placeOrder` swallows the real error, never logs → undebuggable money path. `console.error` before `messageFor`. effort S. **N-err N2**
- **T15** Booth-resolve DB error shown as "code expired — rescan" (wrong, infinite loop, no log). Distinguish DB-error from expired. effort S. **N-err N3**
- **T16** Vendor board/stats render empty/zero on read error (vendor thinks queue is clear). Surface a retry state + log. effort S. **N-err N4**

**a11y** (WCAG)

- **T17** No `aria-live` on live status text + pay-panel (silent "ready for pickup" for screen readers, SC 4.1.3). effort S. **F12**
- **T18** Option-choice buttons color-only, no `role=radio`/`aria-checked` (SC 1.4.1/4.1.2); copy `feedback-form.tsx`'s pattern. effort S. **F13**

**Coverage / CI**

- **T19** RLS/pgTAP + real order-path e2e + `next build` run **nowhere** in CI (only check+unit+auth-guard e2e+mutation). Add a Supabase-container CI job: `supabase db reset` + `supabase test db` + the e2e specs; add `pnpm build`. effort M. **C2/C3 + deps-agent + N-cov**

**Config / deps**

- **T20** Dead prod dependency `pino` (+ dev `pino-pretty`), zero imports → remove (or wire a real `lib/log.ts`). effort S. **deps-agent**
- **T21** No `global-error.tsx` (root-layout errors → unstyled page). effort S. **F11**

**Resilience (storage)**

- **T22** Storage orphans: `image-uploader` never deletes replaced/removed objects; `deleteBooth` leaves images; `booth-images` bucket has no `file_size_limit`/`allowed_mime_types`. effort M. **F14/B5**

---

## P3 — worth doing (grouped)

**Correctness / money**

- **T23** `payment_method_kind` unconstrained TEXT, forgeable via direct `booths` PATCH; Row type claims a union → add `CHECK (… IN ('pointer','paynow','stripe'))`. **F16/T1-type**
- **T24** `cancelOrder` doesn't clear `payment_status` → confirmed-paid-then-cancelled drops from revenue, no refund trail. Decide refund/negative-revenue semantics. **F18/money-agent**
- **T25** `can_create_booth` checks `expires_at` but not `valid_from` — entitlement predicate already **diverged** from `booth_servable`. Fix via shared `vendor_entitled()` SQL helper. **F19 = R2** (HIGH-value dedupe: fixes the live drift).
- **T26** Admin `setVendorPlan(pro,amount>0)` resubmit → duplicate `payments` rows (revenue double-count); no idempotency. **F20**
- **T27** `logEvent` metadata unbounded (V7); status-page `boothId`/`orderNumber` no Zod (V8, degrades safe); menu numeric fields no `.max()` → `total_cents` INTEGER overflow (V4); cart array no `.max()` (V5). **V4/V5/V7/V8**

**Latency**

- **T28** RLS bare `auth.uid()` → `(select auth.uid())` systematically (planner cache). Fold into R5 `owns_booth()`. **F21/L8 (+R5)**
- **T29** Admin unbounded full-table scans → bound by date / aggregate in SQL. **F22/L11**

**Resilience / observability (net-new)**

- **T30** Rate-limiter errors invisible at all 3 sites (flood-guard silently degrades open, no log) → log, keep fail-open. **N-err N5**
- **T31** Auth/entitlement guard reads misclassify DB error as "not onboarded" (bounces a real vendor). Distinguish + log. **N-err N6**
- **T32** Admin plan/pass "best-effort" payment insert returns success while dropping a ledger row (ledger diverges from audit). Transactional or surface partial failure. **N-err N8**
- **T33** `proxy`/`updateSession` runs `getUser()` on public `/o/[code]` too → auth outage 500s the customer funnel. try/catch + scope to protected prefixes. **N-err N9**
- **T34** `saveBooth` active-cap count query fails open on error (benign — DB backstop holds — but unlogged). Log. **N-err N10**
- **T35** Payment-QR `<img>` no `onError` fallback (broken image on flaky wifi, can't pay). **F26**
- **T36** Menu +/- buttons missing `aria-label`. **F27**

**Types / dead / hygiene**

- **T37** `types.ts` omits `rate_limits` table + `is_admin`/`can_create_booth`/`apply_order_stock_delta` functions (partial mirror). **F25/T2-type**
- **T38** Dead `order_status` values `pending`/`confirmed` + unreachable `DEFAULT 'pending'`. **F23/P5**
- **T39** `apply_order_stock_delta` keeps PUBLIC EXECUTE (harmless, inconsistent) → REVOKE. **F24/type-agent**
- **T40** Config hygiene: `@types/node` 2 majors behind runtime; `noUncheckedIndexedAccess` off; `poweredByHeader` on; CSP has no `script-src`; `supabase-js ^2` caret float (lockfile-only pin); GH Actions on mutable tags. **deps-agent** (each S; batch).

**More coverage**

- **T41** Add tests: `getOrderStatus` (N2), `requestUpgrade` idempotency (N3), `logEvent` sanitation (N4), `csvCell` quote/newline branches (N6), order-actions status-guard (documents T8). **N-cov N1–N4,N6,N7**

---

## Dedupe / reusable functions (from D1–D12 re-verify + R1–R13; drop D8)

Worthwhile, ranked by drift-risk × payoff. Several **fold into the fixes above** (noted).

- **D2** rate-limit XFF block ×3 → `lib/rate-limit.ts` (`clientIp`+`rateLimit`) — **do before T9/S4**; unblocks the trusted-proxy fix.
- **R2** `vendor_entitled()` SQL helper — **= T25**, fixes live drift.
- **R1** `ok()/err()/fail()` for `ActionResult` (~90 hand-written literals; module ships type only). effort M.
- **R3** `useAsyncAction` hook — 7 hand-rolled busy flags, several leave the button stuck-disabled on throw (latent bug). effort M.
- **R4** `order_item_quantities()` — **= T4**. **R5** `owns_booth()` — **= T28** (+L8).
- **D7** `usePolling` + `getOrderField` — **= T11** (+R13 `useVisibleInterval` for the title-flash).
- **D3** `uuidSchema` in `lib/schemas.ts` (7+ sites). **D4** `centsToDollarString` + unify dollars→cents (~6). **R7** `MoneyInput` (3, parsers disagree). **R6** single-source `WEEKDAYS` (drift silently mislabels the heatmap). **R8** `withinDays`/`parseMsOrNull` (=D11). **D5** `stat-card`. **D6** `lib/stats-range.ts`. **D9** `OrderSummaryTicket` (2 read-only renderers). **R10** `getUser()` helper (6). **R11** `downloadBlob` (2). **R12** `recordPayment` (2, money). **R9** `self_or_admin()` SQL (borderline — only with R5). **D12** booth_servable SQL/TS coupling test (not a merge — a cross-check test).
- **DROP D8** (toast-on-ActionResult) + no mega `withAction` wrapper — over-abstraction (see reuse-agent KEEP-SEPARATE list).

---

## Dependencies / CVE

`pnpm audit` **clean** (prod + dev, zero known vulns). `@supabase/ssr 0.10.3 ↔ supabase-js 2.107.0` (lockfile) satisfies the compat rule. No urgent action. Hygiene items folded into T20/T40.

---

## templateCentral upgrade + checked-in skills (own change cycle)

- **T42** Upgrade templateCentral `5.0.0 → 5.6.0` (latest installed; 5.1/5.4/5.6 cached). Run `templatecentral:migrate` + `templatecentral:standards`; review the AGENTS.md/CLAUDE.md/`harness.json`/CONVENTIONS delta; bump `.claude/harness.json` `templatecentral_version` + the AGENTS.md marker. **HARD CONSTRAINT:** do **not** run `templatecentral:add (auth|database)` — installs better-auth/Drizzle, breaks RLS+realtime (Supabase variant). effort M.
- **T43** Refresh the 4 checked-in project skills (`changelog`, `next-verify`, `security-scan`, `supabase-migrate`) — these are **bespoke** (not tc-shipped), so "update" = align to 5.6 skill/harness conventions surfaced by `standards`, not a copy-over. effort S–M.

---

## Recommended sequencing

1. **Phase A.2 (urgent security + revenue integrity):** T1 (auth lockdown + RPC hardening, migration 0033), T5 (API fail-loud), T2 (margin), with T6 tests. Fold **D2** in (rate-limit lib) since T1 touches rate limiting.
2. **P1 correctness:** T3 (dead route), T4 (oversell race, +R4).
3. **Phase B (revised):** T7–T22 — latency (fold D7/D1/R3), a11y, resilience-logging (T14–T16, cheap batch), CI job (T19), storage (T22), global-error (T21), dead-dep (T20).
4. **Phase C:** T23–T41 P3 + the remaining dedupe/reuse (R1, D3/D4/D5/D6/R6/R7, T28+R5, T25+R2).
5. **Phase D:** coverage buildout (T41 remainder) + the CI e2e already in T19.
6. **T42/T43 (templateCentral 5.6 + skills):** independent; slot when convenient — its own migrate→review cycle.
