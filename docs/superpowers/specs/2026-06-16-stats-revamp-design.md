# Stats Revamp — Design (2026-06-16)

## Overview

Redesign `/dashboard/stats` into a research-grounded analytics page for booth
vendors. Two phases in one effort:

- **Phase 1** — richer analytics on **existing** order data (no new inputs):
  period comparison, trend, day×hour heatmap, top items, fulfilment, options.
- **Phase 2** — **item cost → margin/profit** (the Pro lever): vendor enters
  per-item cost; we surface margin %, profit, contribution-margin ranking.

Out of scope (deferred, per [[qkit-stats-revamp]]): sibling `-kit` sales API
contract, payments shell, prep-time, repeat-customer/CLV.

## Design principles (from web research, 2026-06-16)

Three-layer dashboard (Summary KPIs → Diagnostic breakdowns → drill); most
important metric top-left and largest (F-pattern); ≤5–7 primary KPIs; every
metric carries comparison context (prior-period Δ); chart-by-task (line=trend,
bar=category, KPI card+delta=headline); no chartjunk. Sources: brand.dev,
Yellowfin, ThoughtSpot, Sigma, Toast, Supy.

## Time window

Fixed buckets: **Today, 7d, 30d, 90d**. "Period comparison" = the selected
window vs the immediately prior same-length window (e.g. this 7d vs previous
7d). No custom date picker. Trend granularity: by hour for Today, by day for
7/30/90.

## Metrics

### Phase 1 (existing data)

- **KPI row (5, each with prior-period Δ%):** Revenue, Orders, AOV, Fulfilment
  rate (= completed ÷ (completed + cancelled)), Cancelled count.
- **Trend** — revenue + orders over the window (hour buckets for Today, day
  buckets otherwise).
- **Day×hour heatmap** — 7 × 24 grid, colour = order volume (SGT).
- **Top items** — qty / revenue toggle (extends current chart), option-aware
  labels (reuse `itemLabel`).
- **Options breakdown** — most-selected customization choices.

### Phase 2 (item cost → margin)

- Add optional `cost_cents` to `MenuItem` (lives in `booths.menu_items` JSONB →
  **no SQL migration**). Entered in the menu editor beside price.
- **Cost is snapshotted onto each order item at order time** (like price), so
  historical profit is accurate and immune to later cost edits. Adds
  `cost_cents?` to the order-item shape + `placeOrder`.
- New metrics: **Gross margin %** KPI; **profit per item**; **contribution-
  margin ranking** (profit contribution, not just volume). Shown only when at
  least one item has a cost; degrade gracefully when costs absent.

## Free vs Pro gating

- **Free:** Today window; Revenue/Orders/AOV; top 3 items; peak hour.
- **Pro:** 7/30/90d; period Δ + trend; full top items + drill; heatmap;
  fulfilment + options; **margins**; **CSV export**.

Reuse `allowedStatsRanges`/`normalizePlan` (`src/lib/plan.ts`); extend with a
plan→feature gate for the Pro-only panels.

## Architecture

- **`src/lib/stats.ts` (pure, tested)** — extend, don't restart. Add:
  - `periodDelta(current, prior)` → Δ% per KPI.
  - day×hour matrix (`dayHourMatrix`) alongside the existing `hourly`.
  - `fulfilmentRate` + cancelled count.
  - `optionBreakdown`.
  - margin/profit fields on `TopItem` + a `grossMargin` summary (cost-aware).
  - Keep every function pure (no DB/React/Date) — unit-testable.
- **Server page** (`stats/page.tsx`) fetches the current window **and** the
  prior window (one extra query), computes both summaries, passes deltas down.
- **Split `stats-view.tsx`** into focused components: `KpiRow`, `TrendChart`,
  `BusyHeatmap`, `TopItems`, `MarginTable`, `OptionsBreakdown`. Smaller, testable.
- **Menu editor** (`menu-editor.tsx`) — add a cost input next to price; schema
  (`menuItemFormSchema`, `menuItemSchema`) gains optional `cost_cents`; snapshot
  into order items in `placeOrder`.

## Testing

- Unit-test all new pure stats (period delta incl. divide-by-zero, day×hour
  matrix, fulfilment rate, option breakdown, margin/profit, cost-absent
  degrade). RTL component tests for `KpiRow` (delta rendering), `BusyHeatmap`,
  `MarginTable`. Advisory mutation auto-covers new `lib` on PR.
- UI built with the **frontend-design** skill (Kraft & Ember: ticket motif,
  oklch tokens, Fraunces/Hanken/Space Mono). **templatecentral:standards** drift
  check before merge.

## Build order

1. `lib/stats.ts` extensions + tests (pure core).
2. Phase 2 data: `cost_cents` on schemas/types + menu editor + `placeOrder` snapshot.
3. Server page: dual-window fetch + gating.
4. UI: split components + heatmap + margins (frontend-design).
5. CSV export (Pro). Standards check. Verify (`pnpm check` + tests).
