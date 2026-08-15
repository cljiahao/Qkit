# qkit — Master Task Registry Refresh (2026-08-15)

Six-week verification pass against `2026-07-02-master-task-registry.md`, which
had sat unverified while ~330 commits landed (`git log --oneline --since=2026-07-02`
counts 364 including merges). Every item from the 2026-07-02 doc — all P1-P3
`T` IDs, the `D`edupe candidates, and the `R`euse candidates — was re-checked
against current code, migrations, and git history; nothing here is carried
forward on trust. The 2026-07-02 doc's own Progress section had already marked
most P1/P2 items shipped as of that date; this pass verifies those claims still
hold, closes out its "remaining"/"deferred" lists, and re-derives the Dedupe/
Reuse section (D1-D12, R1-R13) from scratch since that section had the least
verification in the original.

**Headline: the backlog is nearly clear.** Of 43 `T` items + 12 `D` items + 13
`R` items (68 IDs, several intentionally aliased to each other), only **11
items are genuinely still open** — a real, small, actionable list (see
"Still open" below). One item (D8) was already explicitly dropped by the prior
doc's own author, not abandoned by neglect. Everything else shipped, most of
it within days of the original audit, several **with the task ID in the
commit message itself** (e.g. `ac0579e fix(security): ... (T7); ... (T8)`,
`2ab7bff fix(ci+rls): ... (T28); order_status default (T38)`) — this registry
was evidently being worked off directly for weeks; it just never got a status
refresh.

---

## Still open (the real backlog — 11 items)

- **T12** — `revalidate = 0` still set on both hot customer reads:
  `src/app/o/[code]/page.tsx:16` and
  `src/app/order/[boothId]/[orderNumber]/page.tsx:39`. Unchanged from
  2026-07-02; the original doc itself called this a deliberate defer
  ("risky caching, needs careful stock/servable-live split"), still true.
- **T29** — Admin dashboard (`src/app/admin/page.tsx:110-144`) still runs
  unbounded full-table `.select()` scans on `vendors`/`booths`/`orders`/
  `events`/`licenses`/`payments` with no date filter or `.limit()` (only
  `admin_audit` got a `.limit(60)`, in an unrelated earlier change). Confirmed
  by direct read of the query block — genuinely unchanged.
- **T37** — `src/lib/types.ts` (685 lines) still omits the `rate_limits`
  table and the `is_admin`/`can_create_booth`/`apply_order_stock_delta`
  functions (grepped for all four — zero matches). The `supabase-migrate`
  skill (`.claude/skills/supabase-migrate/`) can regenerate it via
  `supabase gen types typescript`, but it evidently hasn't been re-run since
  these were added — still a hand-drifted partial mirror.
- **T40 (partial)** — Most sub-items shipped: `poweredByHeader: false`
  (`next.config.ts:7`), a real `script-src` in the CSP (`next.config.ts:54-55`,
  also touched by today's dev-CSP fix #80), `@types/node` bumped to `^24.13.2`
  (matches the `24.x` Node engine), and GitHub Actions SHA-pinned
  (`85ed6f8`). Still open: `tsconfig.json` has no `noUncheckedIndexedAccess`
  (checked directly — absent), and `@supabase/supabase-js` is still a caret
  range (`^2.48.0` in `package.json`) rather than exact-pinned (lockfile
  covers it in practice, but the stated fix wasn't done).
- **D3** — No shared `uuidSchema` export exists in `src/lib/schemas.ts`;
  still 6 separate raw `z.string().uuid()` call sites (lines 280, 285, 351,
  389, 406, 410). Low-value, unchanged from 2026-07-02.
- **R1** — No `ok()`/`err()`/`fail()` helpers exist for `ActionResult`
  (`src/lib/action-result.ts` defines only the type, no constructors).
  `success: true`/`success: false` literals now number **172** across
  `src/app` (grepped, excluding tests) — up from the original doc's "~90"
  estimate, so the duplication has grown, not shrunk.
- **R5** — `owns_booth()` SQL helper was never extracted. Note the nuance:
  **T28's actual fix (wrapping bare `auth.uid()` in `(select auth.uid())`
  for planner caching) is DONE** — migration `0039_rls_select_auth_uid.sql`
  does this across every qkit-schema policy. But the _dedup_ half of that
  bullet (a shared `owns_booth()` function replacing the repeated
  `vendor_id = (select auth.uid())` inline expression) was not done — each
  policy still repeats the expression inline in migration 0039 itself.
- **R9** — `self_or_admin()` SQL helper doesn't exist (grepped `supabase/`,
  zero matches). The original doc flagged this as "borderline — only with
  R5"; since R5 wasn't done either, this one was never reached.
- **R11** — No shared `downloadBlob` helper. `Blob(`/`URL.createObjectURL`
  usage is now at **4 sites** (`booth-qr-poster.tsx`, `export-button.tsx`,
  `pay-panel.tsx`, `qr-image.ts`) — grew from the original "2".
- **R12** — No shared `recordPayment` helper. `src/app/admin/actions.ts`
  still has two separate `.from("payments").insert(...)` call sites
  (lines 110, 200) with duplicated shape.
- **D12** — No dedicated SQL/TS cross-check test for `booth_servable`.
  Both sides _are_ independently tested (`src/lib/booth-access.test.ts` for
  the TS mirror `servableBoothIds()` in `src/lib/booth-access.ts`, and
  `supabase/tests/rls.test.sql` for the SQL function), and `booth-access.ts`
  carries an explicit code comment documenting the mirror invariant — but
  the specific ask (one test asserting both algorithms agree on the same
  fixture) doesn't exist. Lower-risk than the original framing suggested,
  given the existing dual coverage + documented invariant, but technically
  still open.

**D10** — referenced only implicitly in the original doc's summary line
("D1-D12 re-verify") but never individually described anywhere in its body
(unlike D1-D9, D11, D12, which all get their own bullet or an explicit `=`
alias). Flagging as ambiguous rather than guessing a status — there's no
description to verify against. If this was meant to alias an already-covered
item (numbering gaps happened elsewhere, e.g. via D8's explicit drop), it's
likely already resolved; otherwise it may need re-deriving from the original
sweep-3 reuse-agent source material (`2026-07-02-audit-sweep-2-findings.md`).

---

## Done

**P1 (all shipped 2026-07-02, same day as the original audit):**

- **T1** — `authenticated`-role DB lockdown + RPC hardening. Commit `ed623ce`,
  migration `0033_authenticated_lockdown.sql`.
- **T2** — `cost_cents` omitted (not zeroed) for no-cost items. Same commit/migration
  as T1 — confirmed the `COALESCE(...,0)` fix and the "omit when NULL" jsonb
  logic are in `0033_authenticated_lockdown.sql:106-253`.
- **T3** — Dead `/order/[boothId]` route fixed with a redirect shim. Commit
  `99fb519`.
- **T4 / R4** — Stock oversell race closed + `order_item_quantities()`
  extracted. Commit `99fb519`, migration `0034`.
- **T5** — `/api/v1/sales/summary` fails loud on DB error. Commit `ed623ce`
  (`src/app/api/v1/sales` still returns 503, not a silent 200-with-zeros).
- **T6** — Money-path test coverage extended alongside T1/T2/T5. Commit `ed623ce`.

**P2:**

- **T7** — Missing `WITH CHECK` on UPDATE policies + plan-escalation fix.
  Commit `ac0579e`, migration `0035_update_policy_with_check.sql`.
- **T8** — Order-board status-guard race fix. Commit `ac0579e`.
- **T9** — Rate-limiter index + cleanup. Commit `805dae2`, migration `0036`.
- **T10** — Status-page `Promise.all`. Commit `805dae2`.
- **T11 / D7 / R13** — Shared `usePolling` hook (+ `useVisibleInterval` for
  title-flash). Commit `cc42d2d`.
- **T13** — `React.cache()` memoized `getUser`/`getVendor` reads. Commit `805dae2`.
- **T14/T15/T16** — DB-error surfacing + logging on placeOrder/booth-resolve/
  dashboard reads. Commit `ec5ad72`.
- **T17/T18** — `aria-live` status announcements + option-choice radio
  semantics. Commit `d9b8ae5`.
- **T19** — CI now runs both the RLS/pgTAP job _and_ a real order-lifecycle
  e2e job. `b063ef1` added the pgTAP + `next build` jobs (partial, as the
  original doc noted); `3a00d71 test+ci: cover money/entitlement/claim paths;
run order e2e in CI` closed the gap — confirmed live in
  `.github/workflows/ci.yml`, which has a distinct `e2e-order` job running
  `customer-order.spec.ts` + `order-code.spec.ts` against a seeded local
  Supabase. Fully done, not partial, as of this refresh.
- **T20/T21** — Dead `pino` dep removed, `global-error.tsx` added. Commit `846fd0b`.
- **T22** — Booth-image bucket size/MIME limits + orphan cleanup. Commit
  `575295c`, migration `0037`.

**P3:**

- **T23** — `payment_method_kind` CHECK constraint added. Commit `24b2671`.
- **T24** — Refund bookkeeping — resolved as a policy call (no gateway code
  needed), independently re-confirmed 2026-07-17 per the original doc's own
  Progress section; commit `af1bc5c`.
- **T25 / R2** — Shared `vendor_entitled()` SQL helper closes the
  `valid_from` drift. Commit `24b2671`.
- **T26** — Admin plan/pass resubmit no longer double-counts revenue. Commit
  `8752846 fix(admin): don't double-count subscription revenue on re-submit
(T26)` — this shipped _after_ the 2026-07-02 doc listed it as "Phase C
  remaining," which is exactly the kind of stale-claim gap this refresh
  exists to catch.
- **T27** — Money/cart/metadata/param input bounds (V4/V5/V7/V8). Commit `2ac10b0`.
- **T28** — RLS `(select auth.uid())` planner-cache sweep. Commit `2ab7bff`,
  migration `0039_rls_select_auth_uid.sql`. (The paired dedup half of this
  bullet, `owns_booth()`, is separately tracked as still-open **R5** above —
  see that entry for the split.)
- **T30** — Rate-limiter error logging. Commit `368bd0a`.
- **T31** — Auth/entitlement DB-error misclassification fixed. Commit `a94c704`.
- **T32** — Admin dropped-payment divergence surfaced + tested. Commit `e7518ff`.
- **T33** — Public funnel (`proxy.ts`) survives an auth outage. Commit `43484c8`.
- **T34** — `saveBooth` cap-count error logging. Commit `368bd0a`.
- **T35** — Payment-QR `onError` fallback. Commit `43484c8` — confirmed live
  at `src/app/order/[boothId]/[orderNumber]/pay-panel.tsx:188`
  (`onError={() => setImgError(true)}`); still relevant post the 2026-08-11
  paykit checkout cutover, since the QR image render path (not the deleted
  local EMVCo builder) is what this fallback guards.
- **T36** — Menu qty `+`/`-` `aria-label`s. Commit `43484c8`.
- **T38** — `orders.status` default fixed to `'preparing'`. Commit `2ab7bff`,
  migration `0040_order_status_default.sql`. The dead `pending`/`confirmed`
  enum values were deliberately _not_ dropped — the migration's own comment
  explains why (tolerant-read + no `DROP VALUE` in Postgres short of a full
  type swap) — this is a closed, documented decision, not a remaining gap.
- **T39** — `apply_order_stock_delta` PUBLIC EXECUTE revoked. Commit `24b2671`.
- **T41** — Coverage added for `getOrderStatus`/dropped-payment paths.
  Commit `e7518ff`.

**Dedupe:**

- **D1** — Folded into T13's `React.cache()` fix (per the original doc's own
  "(+D1)" note).
- **D2** — `lib/rate-limit.ts` (`clientIp`+`rateLimit`). Shipped as part of
  Phase A.2, commit `ed623ce`.
- **D4 / R7** — Single dollars↔cents conversion. Commit
  `6958234 refactor(money): single dollars<->cents conversion (D4/R7)`;
  confirmed live in `src/lib/utils.ts` + `src/lib/sales-summary.ts`.
- **D5** — "stat-card" dedup. `src/app/dashboard/stats/kpi-row.tsx` now
  exports one `StatTile` component whose own doc-comment says "the one tile
  the whole stats strip is built from" — money KPIs, order counts, and
  qualitative tiles all render through it.
- **D6** — `stats-range.ts`-equivalent consolidation: `src/lib/stats.ts`
  single-sources `bucketPlan()`/`bucketIndex()`/the series-builder, each with
  an explicit "lives (and is tested) in exactly one place" comment. Not
  literally a file named `stats-range.ts`, but the described duplication
  doesn't exist.
- **D7** — See T11 above (same commit, same hook).
- **D9** — `OrderSummaryTicket` dedup superseded by a broader consolidation:
  commit `f89a9ca refactor: extract shared Ticket component, fix inconsistent
scallop cards` created `src/components/ticket.tsx`, now imported by 18+
  files including the order-status page, order cards, and receipts — a wider
  fix than the original "2 renderers" scope, but it subsumes the ask.

**Reuse:**

- **R2** — See T25 above.
- **R3** — `useAsyncAction` hook, busy-flag-resets-on-throw. Commits
  `a0f73be` (partial) + `5f20432 refactor(ui): finish useAsyncAction sweep —
no stuck buttons on throw`.
- **R4** — See T4 above.
- **R6** — Single-sourced `WEEKDAYS` order/labels. Commit
  `f3db18b refactor: single-source the weekday order + labels (R6)`.
- **R7** — See D4 above.
- **R8 (= D11)** — `withinDays` is single-sourced in `src/lib/admin-stats.ts`
  (one definition, only called within that file — no duplication found).
  `parseMsOrNull` doesn't exist anywhere in the current codebase (grepped) —
  either it was eliminated by a different refactor or the concept it named
  no longer applies; either way, no duplication remains to fix.
- **R10** — `getUser()` helper exists at `src/lib/supabase/get-user.ts`.
- **R13** — See T11 above.

**templateCentral (own cycle):**

- **T42/T43** — Not a one-time task but an ongoing practice that's
  demonstrably been kept current: `9d88edd` (5.0→5.7 review, 2026-07-24
  entry in `AGENTS.md`), `8732547 chore: templateCentral 5.11->5.14 sweep +
code-health audit fixes (#64)`, and today's
  `6ad1468 chore(harness): templateCentral 5.14.0 -> 5.15.0 re-sync (#83)`.
  `AGENTS.md`'s own version-history section documents every intermediate
  review and each deliberate non-adoption decision. The 4 checked-in project
  skills (`changelog`, `next-verify`, `security-scan`, `supabase-migrate`)
  are reviewed as part of each of these cycles, per the same section.

---

## Superseded / obsolete

- **D8** (toast-on-`ActionResult` wrapper + mega `withAction` wrapper) — not
  a gap that shipped code closed; the original 2026-07-02 doc's own author
  explicitly decided **against** building this ("over-abstraction — see
  reuse-agent KEEP-SEPARATE list") and struck it from the backlog at the
  time. Restating it here only to close the loop: this was resolved as a
  considered "won't do," not neglect.

No dedup/reuse candidate was found to have been mooted by code deletion
(e.g. nothing here referenced the local PayNow/EMVCo builder that the
2026-08-11 paykit cutover deleted — T35's QR-fallback item was checked
specifically for this and is still live against the current paykit-backed
render path, see its entry above). No item from the sonarjs
`sonarjs.configs.recommended` rollout (`d00f604`, 85 findings triaged) maps
onto an item in this registry — that pass targeted cognitive-complexity/
nested-conditionals/regex-safety, a different axis than the duplication this
registry's D/R items track, so it neither closed nor obsoleted anything here.

---

## Counts

| Status                                   | Count                                                          |
| ---------------------------------------- | -------------------------------------------------------------- |
| Done                                     | 46                                                             |
| Still open                               | 11 (T12, T29, T37, T40-partial, D3, R1, R5, R9, R11, R12, D12) |
| Ambiguous (not independently verifiable) | 1 (D10)                                                        |
| Superseded/resolved-as-decision          | 1 (D8)                                                         |

(Counts are by distinct ID as enumerated in the 2026-07-02 doc; aliased pairs
like T25/R2 or T4/R4 are counted once each, matching how the original doc
presented them as separate bullets.)
