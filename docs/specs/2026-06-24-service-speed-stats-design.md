# Service-speed stats — design (2026-06-24)

## Why

The stats revamp ([[2026-06-16-stats-revamp-design.md]]) shipped: revenue/orders/
AOV KPIs, fulfilment, top items, **profit & margin** (cost-aware, ranked),
day×hour busy heatmap, options breakdown, trend, reviews, per-event view, CSV.

Audit + community research (2026-06-24) against what food/event vendors actually
track shows our coverage already matches the consensus KPI lists almost
line-for-line — **with one gap: service speed.** Vendors at events live or die on
throughput ("handheld, prep < 5 min, highest throughput"; $1.5k–5k/day gated by
how fast the line moves). We surface revenue, mix, margin, and _when_ it's busy —
but nothing on _how fast we serve_ or _where the line builds_.

This is also the exact pain the prospect (coffee-cart vendor, IG DM) named:
crowding, orders piling up, customers wandering off before the drink is ready.
So service-speed is both the one consensus-backed gap **and** the most demo-able
metric. Sources: Sharpsheets, Mobile Cuisine, Financial Models Lab (food-truck
KPIs); Mile High Tikka (event throughput).

This spec adds a **service-speed layer**; it does not revisit shipped panels.

## Scope decisions (locked during brainstorm)

| Decision         | Choice                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Core metric      | Customer wait = `ready_at − created_at` (placed → ready)                                                                              |
| Data capture     | Add nullable transition timestamps on `orders`; forward-only                                                                          |
| Worst-case / p90 | **Cut.** Max is outlier-driven (stale un-completed orders). Avg + volume overlay convey "rush blew out" without jargon. p90 deferred. |
| Throughput       | Peak orders/hour — derived from existing data                                                                                         |
| Layout           | **Curated/fixed cards. No drag-and-drop / add-remove widgets.**                                                                       |
| Slowest movers   | Optional stretch (bottom items), not core                                                                                             |
| Gating           | Free = "avg wait today" KPI; Pro = chart + overlay + throughput + 7/30/90d                                                            |

### Why no customizable/draggable dashboard (research, 2026-06-24)

Considered making stats dynamic (add/remove/move cards). Evidence says no for
our context:

- Consensus is **"structured flexibility," not blank-canvas** — full
  customization causes choice paralysis; curate first.
- Academic study (ACM IUI 2025, _Effects of Customisation on Usability of Visual
  Analytics Dashboards_): customization helps **only** high-graph-literacy,
  experienced users; for others it **raises cognitive load + slows tasks**, and
  tweaks are mostly transient/reverted. A non-technical food vendor is the exact
  profile it hurts.
- Mobile drag-and-drop is **explicitly discouraged** (drop-target ambiguity,
  scroll-vs-drag conflict, discoverability, a11y); always needs a non-drag
  fallback. (Pencil & Paper.)
- SMB products (Shopify/Square/Toast-class) **curate**: "start with 5–7 critical
  metrics, not 50." Free-form widget dashboards (Grafana/Datadog/GA) target
  multi-role technical teams — not one vendor.

→ Keep the curated fixed layout. If flexibility is ever wanted, use **show/hide
toggles**, not drag. Revisit only if QKit serves multiple distinct vendor roles.

## Data model

Orders today carry only `created_at` + `updated_at` (trigger-bumped on every
change), so wait time is **not recoverable** from existing rows. Capture it going
forward.

- **Migration:** add nullable `ready_at`, `completed_at` (`TIMESTAMPTZ NULL`) to
  `public.orders`. No backfill — past orders have null timestamps and are simply
  excluded from speed stats. (`preparing_at` is omitted: `placeOrder` inserts
  orders already in `preparing` (`order/[boothId]/actions.ts`), so it would equal
  `created_at`.)
- **Stamp on transition:** status advances happen client-side in
  `src/components/order-card.tsx` via `.update({ status })`. Extend that update to
  set the matching timestamp when entering each state (`status: "ready", ready_at:
<now>`; `status: "completed", completed_at: <now>`). `updated_at` keeps its
  existing trigger behaviour. (There is **no** admin order-status write to stamp:
  `admin/page.tsx:153` `status: "completed"` is a synthetic `StatsOrder` built
  from `payments` for the revenue trend, not an order update; and `actions.ts`
  `resolved` writes are _feedback_, not orders.)
- **Types:** add the three fields to `orders` Row/Insert/Update in
  `src/lib/types.ts` (mirror the migration).
- RLS unchanged — a vendor already updates only their own booths' orders; we add
  columns to an update they can already make. No policy change.

## Metric

- **Wait (per order)** = `ready_at − created_at`, in seconds. Computed only when
  both timestamps exist; orders missing `ready_at` (still open, or pre-migration)
  are excluded — **not** counted as zero.
- **Average wait** over the window → the dotted reference line on the chart.
- **Wait series** = average wait per time bucket (hour buckets for Today, day
  buckets for 7/30/90d) — matches the existing `windowSeries` bucketing.
- **Volume overlay** = order count per the same bucket, drawn behind the wait
  line, so the vendor sees wait climb as orders stack.
- **Throughput** = peak orders/hour (max bucket count when bucketed hourly).

Explicitly **excluded:** standalone max/p90 "longest wait" KPI (outlier-prone;
the overlay shows rush spikes instead). p90 reconsidered later only if needed,
and would use the 90th percentile with stale un-completed orders filtered out.

## Architecture

Follows the shipped stats pattern — pure core in `lib/stats.ts`, focused
components, dual-window fetch in the server page.

- **`src/lib/stats.ts` (pure, tested)** — extend, don't restart. Add:
  - `StatsOrder` gains optional `ready_at?: string | null` (and the others if
    cheap) — fed from the page fetch.
  - `avgWaitSeconds(orders)` → mean of valid `ready_at − created_at`, null when
    no order qualifies (UI shows "—").
  - `waitSeries(orders, nowMs, buckets, bucketMs)` → per-bucket `{ t,
avgWaitSeconds | null, orders }`. Null-wait buckets render as gaps, not 0.
  - `peakThroughput(orders, ...)` → max hourly order count.
  - Keep every function pure (no DB/React/Date) — unit-testable.
- **Server page** (`stats/page.tsx`) — extend the existing fetch `select` to
  include the new timestamp columns; pass speed data into the view. Honour the
  same plan gate (`entitlement`) used for trend/heatmap.
- **New component** `service-speed-chart.tsx` — line (avg wait) + dotted average
  reference line + volume overlay (Recharts, as the other charts). Kraft & Ember
  styling via the **frontend-design** skill (ticket motif, oklch tokens,
  Fraunces/Hanken/Space Mono). Renders only when ≥1 order has a wait; degrades to
  an empty-state ("No timing data yet — it starts collecting from your next
  order") otherwise.
- **Free KPI** — single "avg wait today" stat in the existing `KpiRow` path,
  gated like the other free metrics.

### Stats-page design polish (frontend-design)

Alongside the new panel, a cohesion pass over the whole stats page using the
**frontend-design** skill — consistent card rhythm/spacing, clearer visual
hierarchy (Revenue still leads, F-pattern), the new service-speed card sitting
naturally beside trend/heatmap in the Kraft & Ember system (ticket motif, oklch
tokens, Fraunces/Hanken/Space Mono). Scope = visual refinement of existing +
new cards; **not** a re-layout into a customizable/draggable dashboard (see
research note). Curated order stays curated.

## Data flow

```
order-card.tsx  ── .update({ status, <state>_at }) ──▶ orders (timestamps)
                                                          │
stats/page.tsx  ── select(..., ready_at) ── fetchOrders ─┤
                                                          ▼
lib/stats.ts  avgWaitSeconds / waitSeries / peakThroughput (pure)
                                                          ▼
service-speed-chart.tsx  (wait line + dotted avg + volume overlay)
```

## Error handling / edge cases

- Orders with null `ready_at` (open, cancelled before ready, or pre-migration) →
  excluded from all wait math. Never coerced to 0.
- Empty window (no qualifying orders) → component renders the empty-state, not a
  flat zero line.
- Clock skew / negative interval (`ready_at < created_at`) → clamp to 0 and skip,
  defensively; shouldn't occur (both server-stamped) but don't surface negatives.
- Cancelled orders excluded (consistent with `computeStats`).

## Testing

- Unit-test the new pure stats: `avgWaitSeconds` (mix of valid/null, empty →
  null, negative-interval guard), `waitSeries` (bucket gaps for null,
  boundary/window edges), `peakThroughput`. Advisory mutation auto-covers new
  `lib` on PR.
- RTL component test for `service-speed-chart` (renders line + dotted avg;
  empty-state when no timing data; overlay present).
- `pnpm check` + suite green. **templatecentral:standards** drift check before
  merge.

## Build order

1. Migration: `orders` timestamp columns + `src/lib/types.ts` mirror.
2. Stamp transitions in `order-card.tsx` (+ any other status-update path — verify
   none others write status).
3. `lib/stats.ts` extensions + unit tests (pure core).
4. Server page: extend select + gating; Free avg-wait KPI.
5. `service-speed-chart.tsx` (frontend-design) + component test.
6. Optional stretch: "slowest movers" (bottom-N items) — separate, flagged.
7. Verify (`pnpm check` + tests), standards drift check.

## Out of scope (YAGNI)

- Customizable / draggable / add-remove dashboard layout (see research note).
- p90 / max "longest wait" KPI (deferred; outlier risk).
- Labor cost, inventory, repeat-customer / CLV — no data source, or scope creep.
- Backfill of historical wait times — impossible without past timestamps.
- The demo-video generator ([[2026-06-24-demo-video-generator-design.md]]) —
  parked, separate effort.
