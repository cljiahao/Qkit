# Vendor stats page — design

Date: 2026-06-10

## Problem

Vendors have no view of how their booths are performing — revenue, order
volume, or which items sell. Add a stats page to the dashboard.

## Decisions (from brainstorming)

- Separate `/dashboard/stats` page (new nav item beside Orders/Booths).
- Metrics v1: **Revenue, Orders, AOV** (KPI cards) + **Top items** (bar chart).
- Render with a **chart library** (Recharts) for the top-items bar; KPIs are cards.
- Scope: **aggregate across all the vendor's booths**, with a **booth filter**.
- Out of scope: status breakdown, busy-hours/days (deferred).

## Time windows

Rolling **24h / 7d / 30d**, cutoff = `now - N days` (`new Date()` in the server
component — normal app runtime). Rolling avoids calendar-timezone bugs (orders
stored UTC; vendor in SG, UTC+8). Default **7d**.

## What counts

**Cancelled orders are excluded** from every metric.

- Revenue = Σ `total_cents` over non-cancelled orders in window.
- Orders = count of those orders.
- AOV = `revenue / orders`, or 0 when there are no orders.
- Top items: walk each non-cancelled order's `items`, key by **name + options**
  (`formatOptions` → e.g. "Kopi · Iced"), sum quantity and revenue
  (`price_cents * quantity`, 0 when unpriced). Rank by quantity desc, take top 10.

## Architecture

### Aggregation module — `src/lib/stats.ts` (pure, tested)

```ts
export type StatsOrder = {
  status: OrderStatus;
  total_cents: number;
  items: OrderItem[];
};
export type TopItem = {
  label: string;
  quantity: number;
  revenue_cents: number;
};
export type StatsSummary = {
  revenue_cents: number;
  orderCount: number;
  aov_cents: number;
  topItems: TopItem[];
};
export function computeStats(orders: StatsOrder[], topN = 10): StatsSummary;
```

No DB, no React, no `Date` — fully unit-testable. `label` uses `formatOptions`
from `utils.ts`. AOV uses integer cents (`Math.round`).

### Page — `src/app/dashboard/stats/page.tsx` (server component)

- `revalidate = 0`.
- `params`/`searchParams` are async (Next 16): read `range` (`24h|7d|30d`, default
  `7d`) and `booth` (`all` or a booth id, default `all`).
- `getVendor()` → redirect to `/login` / `/onboarding` as elsewhere.
- Fetch vendor booths `(id, name)` for the filter.
- Compute cutoff ISO from range. Query `orders` filtered by `booth_id in (vendor
booth ids)` (or the one selected booth), `created_at >= cutoff`. RLS already
  scopes to the vendor; the explicit `in` keeps a foreign `booth` param from
  widening results.
- Map rows → `StatsOrder[]` via `parseOrderItems(row.items)`; call `computeStats`.
- Render `<StatsControls>` + `<StatsView>`.

### Controls — `src/app/dashboard/stats/stats-controls.tsx` (client)

Range tabs (24h / 7d / 30d) + booth `<select>` (All booths + each booth). On
change, push updated search params (`useRouter` + `useSearchParams`), so the
server component refetches. No client data fetching.

### View — `src/app/dashboard/stats/stats-view.tsx`

- KPI cards: Revenue (formatPrice), Orders, AOV (formatPrice).
- Top items: Recharts horizontal `BarChart` (label vs quantity). Empty state
  ("No orders in this window") when `orderCount === 0`.

### Nav — `src/app/dashboard/layout.tsx`

Add a "Stats" link between Orders and Booths.

## Chart library risk

Recharts must be compatible with React 19 / Next 16. Verify at implementation
start (`pnpm add recharts`, then `pnpm build`). If it breaks under React 19,
fall back to a zero-dependency CSS bar list (a flex row + width-% div per item)
and note the swap. KPIs are unaffected either way.

## Testing

- `src/lib/stats.test.ts`:
  - excludes cancelled orders from revenue/count/top items;
  - revenue/AOV math (incl. AOV = 0 with no orders);
  - top items aggregate by name + options, option-aware labels, qty ranking,
    `topN` limit;
  - unpriced items contribute quantity but 0 revenue.
- Gate: `pnpm check` 0, all tests pass, `pnpm build` clean.
- Manual (prod or local): place a few orders incl. a cancelled one + a
  customized item, switch ranges + booth filter, confirm numbers + bars.

## Files

- `src/lib/stats.ts` (new)
- `src/lib/stats.test.ts` (new)
- `src/app/dashboard/stats/page.tsx` (new)
- `src/app/dashboard/stats/stats-controls.tsx` (new)
- `src/app/dashboard/stats/stats-view.tsx` (new)
- `src/app/dashboard/layout.tsx` (nav link)
- `package.json` (recharts, if compatible)

## Untouched

Orders schema, RLS, realtime, order placement — stats is read-only aggregation
over existing data.
