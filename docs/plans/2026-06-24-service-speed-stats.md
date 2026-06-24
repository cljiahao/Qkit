# Service-speed stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a customer service-speed layer to `/dashboard/stats` — wait time (placed→ready) with average line + order-volume overlay, plus peak throughput — and a frontend-design cohesion pass over the page.

**Architecture:** Capture per-transition timestamps on `orders` going forward (`ready_at`, `completed_at`), stamped where status advances. Pure functions in `src/lib/stats.ts` derive wait/throughput from those timestamps; the server page fetches them and gates them (Free = one KPI, Pro = chart); a new Recharts card renders the wait line + volume overlay in the Kraft & Ember system.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript strict, Supabase (`@supabase/ssr`), Recharts, Vitest (node + jsdom/RTL), Tailwind v4, shadcn/ui.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Authorization lives in **RLS policies**, not app code — never widen a policy to fix a query.
- Service-role client only in Server Actions / Route Handlers, never client components.
- After editing the schema, update **both** `supabase/migrations/` **and** `src/lib/types.ts`.
- `src/lib/stats.ts` functions stay **pure** — no DB, no React, no `Date.now()`; pass `nowMs` in.
- `@supabase/ssr` 0.10.x ↔ `@supabase/supabase-js` 2.10x must stay compatible.
- Tests: pure logic → `*.test.ts` (node); component → `*.dom.test.tsx` (RTL + jsdom).
- Design follows **Kraft & Ember** (ticket motif, oklch tokens, Fraunces/Hanken/Space Mono). `src/components/ui/` is CLI-managed — do not hand-edit.
- Wait time is **forward-only**: past orders have null timestamps and are excluded — never coerced to 0.
- Verify with `pnpm check` (prettier + eslint + tsc) and `pnpm test`.

---

### Task 1: DB migration + types — `ready_at` / `completed_at`

**Files:**

- Create: `supabase/migrations/0022_order_timestamps.sql`
- Modify: `src/lib/types.ts:354-396` (orders Row/Insert/Update)

**Interfaces:**

- Produces: `orders.ready_at` and `orders.completed_at` (`TIMESTAMPTZ NULL`); the `orders` type in `Database` gains `ready_at: string | null` / `completed_at: string | null` (Row) and optional in Insert/Update.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0022_order_timestamps.sql`:

```sql
-- Service-speed stats need to know WHEN an order became ready / was picked up,
-- not just its current status. created_at + updated_at can't recover this
-- (updated_at is overwritten on every change). Capture transition timestamps
-- going forward; past orders stay null and are excluded from wait metrics.
-- preparing_at is omitted: placeOrder inserts orders already in 'preparing',
-- so it would equal created_at.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ready_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
```

- [ ] **Step 2: Mirror the columns in `src/lib/types.ts`**

In the `orders` block (around line 354), add `ready_at` / `completed_at` to all three shapes:

Row (after `created_at: string;` / before `updated_at: string;`):

```ts
created_at: string;
ready_at: string | null;
completed_at: string | null;
updated_at: string;
```

Insert (after `created_at?: string;`):

```ts
          created_at?: string;
          ready_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
```

Update (after `created_at?: string;`):

```ts
          created_at?: string;
          ready_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
```

- [ ] **Step 3: Apply the migration locally**

Run: `/supabase-migrate` (or `supabase db reset` against the local stack).
Expected: migration `0022_order_timestamps` applies clean; `orders` has the two new nullable columns.

- [ ] **Step 4: Typecheck**

Run: `pnpm check`
Expected: PASS (tsc sees the new columns; no usages broken yet).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0022_order_timestamps.sql src/lib/types.ts
git commit -m "feat(stats): add ready_at/completed_at to orders for wait-time"
```

---

### Task 2: Stamp the timestamps on status transitions

**Files:**

- Modify: `src/components/order-card.tsx:63-92` (`advanceStatus`)
- Modify: `src/app/admin/page.tsx:153` (admin force-complete)

**Interfaces:**

- Consumes: `orders.ready_at` / `orders.completed_at` (Task 1).
- Produces: on `preparing→ready` the row gets `ready_at = now`; on `ready→completed` it gets `completed_at = now`; admin force-complete sets `completed_at = now`.

- [ ] **Step 1: Stamp the matching timestamp in `advanceStatus`**

In `src/components/order-card.tsx`, replace the update inside `advanceStatus` (lines 66-69) so the transition also writes its timestamp. Use one ISO timestamp for the write:

```ts
setUpdating(true);
const nowIso = new Date().toISOString();
const patch: { status: OrderStatus; ready_at?: string; completed_at?: string } =
  { status: advance.next };
if (advance.next === "ready") patch.ready_at = nowIso;
if (advance.next === "completed") patch.completed_at = nowIso;
const { error } = await supabase
  .from("orders")
  .update(patch)
  .eq("id", order.id);
```

(`cancelOrder` is unchanged — cancelled orders are excluded from wait stats.)

- [ ] **Step 2: Stamp `completed_at` in the admin force-complete**

In `src/app/admin/page.tsx` around line 153, the update that sets `status: "completed"` must also set `completed_at`. Change the updated object to:

```ts
        status: "completed",
        completed_at: new Date().toISOString(),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm check`
Expected: PASS — the `Update` type now accepts `ready_at`/`completed_at`.

- [ ] **Step 4: Manual verification (local Supabase up)**

Start the app, advance a seeded order preparing→ready→completed on the board, then in Supabase Studio confirm that row's `ready_at` and `completed_at` are populated and `ready_at < completed_at`.

- [ ] **Step 5: Commit**

```bash
git add src/components/order-card.tsx src/app/admin/page.tsx
git commit -m "feat(stats): stamp ready_at/completed_at when orders advance"
```

---

### Task 3: Pure stats functions — `avgWaitSeconds`, `waitSeries`, `peakThroughput`

**Files:**

- Modify: `src/lib/stats.ts` (extend `StatsOrder`; add three functions + `WaitPoint` type)
- Modify: `src/lib/stats.test.ts` (new tests)

**Interfaces:**

- Consumes: `StatsOrder` gains `ready_at?: string | null`.
- Produces:
  - `type WaitPoint = { t: number; avgWaitSeconds: number | null; orders: number }`
  - `avgWaitSeconds(orders: StatsOrder[]): number | null`
  - `waitSeries(orders: StatsOrder[], nowMs: number, buckets: number, bucketMs: number): WaitPoint[]`
  - `peakThroughput(orders: StatsOrder[]): number`

- [ ] **Step 1: Write failing tests**

Append to `src/lib/stats.test.ts`. Note the existing `order()` helper (lines 9-16) doesn't set `ready_at`; build wait orders inline:

```ts
import { avgWaitSeconds, waitSeries, peakThroughput } from "./stats";

function waitOrder(
  created_at: string,
  ready_at: string | null,
  status: StatsOrder["status"] = "completed",
): StatsOrder {
  return { status, total_cents: 500, items: [], created_at, ready_at };
}

describe("avgWaitSeconds", () => {
  it("returns null when no order has a ready_at", () => {
    expect(
      avgWaitSeconds([waitOrder("2026-06-12T04:00:00Z", null)]),
    ).toBeNull();
    expect(avgWaitSeconds([])).toBeNull();
  });

  it("averages ready_at - created_at in seconds, ignoring un-readied orders", () => {
    const orders = [
      waitOrder("2026-06-12T04:00:00Z", "2026-06-12T04:02:00Z"), // 120s
      waitOrder("2026-06-12T04:00:00Z", "2026-06-12T04:08:00Z"), // 480s
      waitOrder("2026-06-12T04:00:00Z", null), // excluded
    ];
    expect(avgWaitSeconds(orders)).toBe(300); // (120+480)/2
  });

  it("excludes cancelled and guards negative (clock-skew) intervals", () => {
    const orders = [
      waitOrder("2026-06-12T04:00:00Z", "2026-06-12T04:02:00Z", "cancelled"),
      waitOrder("2026-06-12T04:05:00Z", "2026-06-12T04:00:00Z"), // negative → skip
    ];
    expect(avgWaitSeconds(orders)).toBeNull();
  });
});

describe("waitSeries", () => {
  it("buckets avg wait + order volume, null wait for buckets with no readied order", () => {
    const now = Date.parse("2026-06-12T04:00:00Z");
    const hour = 3_600_000;
    const orders = [
      waitOrder("2026-06-12T03:30:00Z", "2026-06-12T03:33:00Z"), // this bucket, 180s
      waitOrder("2026-06-12T03:40:00Z", null), // this bucket, counts volume only
      waitOrder("2026-06-12T02:30:00Z", null), // prior bucket, volume only
    ];
    const s = waitSeries(orders, now, 2, hour);
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({ t: now - hour, avgWaitSeconds: null, orders: 1 });
    expect(s[1]).toEqual({ t: now, avgWaitSeconds: 180, orders: 2 });
  });
});

describe("peakThroughput", () => {
  it("returns the busiest single clock-hour's order count", () => {
    const orders = [
      waitOrder("2026-06-12T04:05:00Z", null),
      waitOrder("2026-06-12T04:50:00Z", null),
      waitOrder("2026-06-12T06:10:00Z", null), // different hour
    ];
    expect(peakThroughput(orders)).toBe(2);
  });

  it("returns 0 for no orders", () => {
    expect(peakThroughput([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- stats.test.ts`
Expected: FAIL — `avgWaitSeconds`/`waitSeries`/`peakThroughput` not exported.

- [ ] **Step 3: Implement the functions**

In `src/lib/stats.ts`, add `ready_at` to `StatsOrder` (around line 5):

```ts
export type StatsOrder = {
  status: OrderStatus;
  total_cents: number;
  items: OrderItem[];
  created_at: string;
  ready_at?: string | null;
};
```

Then append:

```ts
export type WaitPoint = {
  t: number;
  avgWaitSeconds: number | null;
  orders: number;
};

/** Seconds from placed→ready, per order. null if missing/invalid/negative. */
function waitOf(o: StatsOrder): number | null {
  if (!o.ready_at) return null;
  const created = Date.parse(o.created_at);
  const ready = Date.parse(o.ready_at);
  if (!Number.isFinite(created) || !Number.isFinite(ready)) return null;
  const wait = (ready - created) / 1000;
  return wait >= 0 ? wait : null; // guard clock skew
}

/**
 * Mean placed→ready wait (seconds) over non-cancelled orders that reached ready.
 * null when none qualify — the UI shows "—", never a misleading 0.
 */
export function avgWaitSeconds(orders: StatsOrder[]): number | null {
  let sum = 0;
  let n = 0;
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const w = waitOf(o);
    if (w === null) continue;
    sum += w;
    n += 1;
  }
  return n ? sum / n : null;
}

/**
 * Per-bucket average wait + order volume across a window ending nowMs. Mirrors
 * windowSeries bucketing. A bucket with orders but none readied gets
 * avgWaitSeconds: null (rendered as a gap, not 0). Cancelled excluded.
 */
export function waitSeries(
  orders: StatsOrder[],
  nowMs: number,
  buckets: number,
  bucketMs: number,
): WaitPoint[] {
  const sums = Array.from({ length: buckets }, () => 0);
  const waited = Array.from({ length: buckets }, () => 0);
  const counts = Array.from({ length: buckets }, () => 0);
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const t = Date.parse(o.created_at);
    if (!Number.isFinite(t)) continue;
    const ago = Math.floor((nowMs - t) / bucketMs);
    const idx = buckets - 1 - ago;
    if (idx < 0 || idx >= buckets) continue;
    counts[idx] += 1;
    const w = waitOf(o);
    if (w !== null) {
      sums[idx] += w;
      waited[idx] += 1;
    }
  }
  return Array.from({ length: buckets }, (_, idx) => ({
    t: nowMs - (buckets - 1 - idx) * bucketMs,
    avgWaitSeconds: waited[idx] ? sums[idx] / waited[idx] : null,
    orders: counts[idx],
  }));
}

/** Busiest single clock-hour's order count (non-cancelled). 0 if none. */
export function peakThroughput(orders: StatsOrder[]): number {
  const byHour = new Map<number, number>();
  let peak = 0;
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const t = Date.parse(o.created_at);
    if (!Number.isFinite(t)) continue;
    const slot = Math.floor(t / 3_600_000);
    const n = (byHour.get(slot) ?? 0) + 1;
    byHour.set(slot, n);
    if (n > peak) peak = n;
  }
  return peak;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- stats.test.ts`
Expected: PASS (all new + existing stats tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(stats): pure wait-time + throughput functions"
```

---

### Task 4: Wire the server page — fetch, compute, gate

**Files:**

- Modify: `src/app/dashboard/stats/page.tsx` (`fetchOrders` select + map; build speed data; pass to view)
- Modify: `src/app/dashboard/stats/stats-view.tsx` (new `speed` prop; render KPI/chart)

**Interfaces:**

- Consumes: `avgWaitSeconds`, `waitSeries`, `peakThroughput`, `WaitPoint` (Task 3); `ServiceSpeedChart` (Task 5).
- Produces: `StatsView` gains prop `speed?: Speed | null` where `type Speed = { avgWaitSeconds: number | null; series: WaitPoint[] | null; peakThroughput: number }`.

- [ ] **Step 1: Include `ready_at` in the orders fetch**

In `src/app/dashboard/stats/page.tsx`, `fetchOrders` (lines 52-64): add `ready_at` to the `.select(...)` string and to the mapped object:

```ts
let query = supabase
  .from("orders")
  .select("status, total_cents, items, created_at, ready_at")
  .in("booth_id", boothIds)
  .gte("created_at", gte);
if (lt) query = query.lt("created_at", lt);
const { data } = await query;
return (data ?? []).map((row) => ({
  status: row.status,
  total_cents: row.total_cents,
  items: parseOrderItems(row.items),
  created_at: row.created_at,
  ready_at: row.ready_at,
}));
```

- [ ] **Step 2: Build the `speed` object in the live view**

In `page.tsx`, after `series = windowSeries(...)` inside the `if (pro && queryIds.length)` block (around line 258), add the Pro speed series + throughput; and compute the always-available avg for the Free KPI. Add near the top of the render data (after `const summary = computeStats(orders);`, ~line 232):

```ts
const avgWait = avgWaitSeconds(orders);
```

Inside the `if (pro && queryIds.length)` block, after `series = windowSeries(...)`:

```ts
waitPoints = waitSeries(orders, now, buckets, bucketMs);
peak = peakThroughput(orders);
```

Declare alongside the existing `let series` (around line 244):

```ts
let waitPoints: WaitPoint[] | null = null;
let peak = 0;
```

Update the imports from `@/lib/stats` to include `avgWaitSeconds, waitSeries, peakThroughput, type WaitPoint`.

Pass a `speed` prop to the live `<StatsView>` (around line 279):

```ts
      <StatsView
        summary={summary}
        deltas={deltas}
        series={series}
        range={range}
        boothId={selectedBooth}
        pro={pro}
        speed={{ avgWaitSeconds: avgWait, series: waitPoints, peakThroughput: peak }}
      />
```

(The per-event `<StatsView>` at line 191 leaves `speed` unset — the prop is optional.)

- [ ] **Step 3: Add the `speed` prop + rendering to `StatsView`**

In `src/app/dashboard/stats/stats-view.tsx`:

Import the chart and type:

```ts
import { ServiceSpeedChart } from "./service-speed-chart";
import type { SeriesPoint, StatsSummary, WaitPoint } from "@/lib/stats";
```

Add to `Props`:

```ts
type Speed = {
  avgWaitSeconds: number | null;
  series: WaitPoint[] | null;
  peakThroughput: number;
} | null;

interface Props {
  summary: StatsSummary;
  deltas: Deltas;
  series: SeriesPoint[] | null;
  range: string;
  boothId: string;
  pro: boolean;
  speed?: Speed;
}
```

Destructure `speed` in the function signature.

In the **Pro** branch, after the `TrendChart` block, add (only when there's at least one bucket with a recorded wait):

```ts
          {speed?.series && speed.series.some((p) => p.avgWaitSeconds !== null) && (
            <Block delay={150}>
              <ServiceSpeedChart
                series={speed.series}
                range={range}
                peakThroughput={speed.peakThroughput}
              />
            </Block>
          )}
```

In the **Free** branch, after the busiest-hour block, add an avg-wait KPI when available:

```ts
          {speed?.avgWaitSeconds != null && (
            <Block delay={210}>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Avg wait
                </p>
                <p className="mt-1 font-mono text-2xl font-bold">
                  {Math.round(speed.avgWaitSeconds / 60)}m{" "}
                  {Math.round(speed.avgWaitSeconds % 60)}s
                </p>
              </div>
            </Block>
          )}
```

- [ ] **Step 4: Typecheck (chart not built yet → expect a missing-module error to resolve in Task 5)**

Run: `pnpm check`
Expected: FAIL only on `./service-speed-chart` not existing. (Proceed to Task 5; this task's commit comes after Task 5 compiles. If you prefer a green commit here, stub the chart first per Task 5 Step 3.)

- [ ] **Step 5: Commit (after Task 5 compiles)**

```bash
git add src/app/dashboard/stats/page.tsx src/app/dashboard/stats/stats-view.tsx
git commit -m "feat(stats): fetch + gate service-speed (free KPI, pro chart)"
```

---

### Task 5: `ServiceSpeedChart` component (frontend-design)

**Files:**

- Create: `src/app/dashboard/stats/service-speed-chart.tsx`
- Modify: `src/app/dashboard/stats/stats-components.dom.test.tsx` (add cases)

**Interfaces:**

- Consumes: `WaitPoint` (Task 3).
- Produces: `ServiceSpeedChart({ series: WaitPoint[]; range: string; peakThroughput: number })`.

- [ ] **Step 1: Write a failing component test**

Append to `src/app/dashboard/stats/stats-components.dom.test.tsx` (follow the file's existing render/imports style):

```ts
import { ServiceSpeedChart } from "./service-speed-chart";

describe("ServiceSpeedChart", () => {
  const series = [
    { t: 1, avgWaitSeconds: 120, orders: 3 },
    { t: 2, avgWaitSeconds: 300, orders: 8 },
  ];

  it("renders the heading and peak throughput", () => {
    render(<ServiceSpeedChart series={series} range="7d" peakThroughput={8} />);
    expect(screen.getByText(/service speed/i)).toBeInTheDocument();
    expect(screen.getByText(/8\s*\/\s*hr/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- stats-components.dom.test.tsx`
Expected: FAIL — module `./service-speed-chart` not found.

- [ ] **Step 3: Implement the chart**

Create `src/app/dashboard/stats/service-speed-chart.tsx`. Use the **frontend-design** skill for the visual treatment; it must match `trend-chart.tsx` (card shell, axis styling, Kraft & Ember tokens). Wait line + dotted average `ReferenceLine` + order-volume bars on a secondary axis:

```tsx
"use client";

import {
  Bar,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { shortDay } from "@/lib/tz";
import type { WaitPoint } from "@/lib/stats";

const RANGE_LABEL: Record<string, string> = {
  "24h": "last 24 hours",
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
};

/** Seconds → "4.2m" / "45s" for axis + tooltip. */
function fmtWait(seconds: number): string {
  return seconds >= 60
    ? `${(seconds / 60).toFixed(1)}m`
    : `${Math.round(seconds)}s`;
}

export function ServiceSpeedChart({
  series,
  range,
  peakThroughput,
}: {
  series: WaitPoint[];
  range: string;
  peakThroughput: number;
}) {
  const waits = series
    .map((p) => p.avgWaitSeconds)
    .filter((w): w is number => w !== null);
  const avg = waits.length
    ? waits.reduce((a, b) => a + b, 0) / waits.length
    : 0;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Service speed{" "}
          <span className="font-normal normal-case tracking-normal text-muted-foreground/70">
            · {RANGE_LABEL[range] ?? range}
          </span>
        </p>
        <p className="text-xs font-medium text-muted-foreground">
          Peak{" "}
          <span className="font-mono font-semibold text-foreground">
            {peakThroughput}/hr
          </span>
        </p>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart
          data={series}
          margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
        >
          <XAxis
            dataKey="t"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
            interval="preserveStartEnd"
            tickFormatter={(t) => shortDay(Number(t))}
          />
          <YAxis
            yAxisId="wait"
            width={44}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => fmtWait(Number(v))}
          />
          <YAxis yAxisId="vol" orientation="right" hide />
          <Tooltip
            cursor={{ stroke: "var(--color-border)" }}
            formatter={(value, name) =>
              name === "avgWaitSeconds"
                ? [fmtWait(Number(value)), "avg wait"]
                : [`${value} orders`, ""]
            }
            labelFormatter={(label) => shortDay(Number(label))}
          />
          <Bar
            yAxisId="vol"
            dataKey="orders"
            fill="var(--color-muted)"
            opacity={0.5}
            radius={[3, 3, 0, 0]}
          />
          <ReferenceLine
            yAxisId="wait"
            y={avg}
            stroke="var(--color-muted-foreground)"
            strokeDasharray="4 4"
          />
          <Line
            yAxisId="wait"
            type="monotone"
            dataKey="avgWaitSeconds"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </section>
  );
}
```

- [ ] **Step 4: Run the component test + full check**

Run: `pnpm test -- stats-components.dom.test.tsx`
Expected: PASS.
Run: `pnpm check`
Expected: PASS (Task 4's missing-module error is now resolved).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/stats/service-speed-chart.tsx src/app/dashboard/stats/stats-components.dom.test.tsx
git commit -m "feat(stats): service-speed chart — wait line, avg, volume overlay"
```

---

### Task 6: Stats-page design cohesion pass (frontend-design)

**Files:**

- Modify: `src/app/dashboard/stats/stats-view.tsx` (section rhythm, headers, ordering)
- Modify (as needed): `src/app/dashboard/stats/{kpi-row,trend-chart,busy-heatmap,top-items,margin-table,options-breakdown,service-speed-chart}.tsx` (consistent card header style/spacing only)

**Interfaces:**

- Consumes: all stats card components.
- Produces: no API changes — visual refinement only. Curated order preserved (Revenue leads; F-pattern). **No** drag/add-remove/customizable layout (per spec research note).

- [ ] **Step 1: Invoke the frontend-design skill**

Use the **frontend-design** skill to guide this pass. Target a coherent Kraft & Ember rhythm across the page; do not introduce customization/drag UI.

- [ ] **Step 2: Apply cohesion tweaks**

Concrete, bounded changes only:

- Unify every card's section header to one pattern (the `text-xs font-semibold uppercase tracking-wider text-muted-foreground` eyebrow already used in `trend-chart`/`margin-table`) so KPI, trend, heatmap, top-items, margin, options, and the new speed card read as one family.
- Confirm vertical spacing uses the existing `space-y-6` scale and `Block` stagger; place `ServiceSpeedChart` directly under `TrendChart` (speed reads with trend).
- Ensure consistent `rounded-xl border border-border bg-card p-4` shell on every card (fix any drift).
- Keep ≤5–7 primary KPIs; do not add metrics here.

- [ ] **Step 3: Visual verification**

Use `/run` (or `pnpm dev`) to load `/dashboard/stats` at a phone-width viewport with the coffee-cart seed; confirm cards align, the speed chart matches the trend chart, and nothing overflows on mobile.

- [ ] **Step 4: Check + standards**

Run: `pnpm check`
Expected: PASS.
Run: `templatecentral:standards` drift check.
Expected: no new naming/validation drift.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/stats/
git commit -m "style(stats): cohesion pass across stats cards (frontend-design)"
```

---

### Task 7 (optional stretch): Slowest movers

**Files:**

- Modify: `src/app/dashboard/stats/top-items.tsx` (or a sibling) + `stats-view.tsx`

Flagged optional — only if wanted after the core lands. Surface the bottom-N items by quantity ("slowest movers") so the vendor can cut menu deadweight, reusing the existing `summary.topItems` (sort ascending, slice). Pro-only. Add a unit/dom test mirroring `top-items`. Skip unless requested.

---

## Self-Review

**Spec coverage:**

- Data capture (ready_at/completed_at, forward-only, stamp on transition, admin path) → Tasks 1–2. ✅
- Metric: wait = ready−created, avg dotted line, volume overlay, **no p90/max** → Tasks 3, 5. ✅
- Throughput (peak orders/hr) → Tasks 3, 5. ✅
- Gating (Free avg-wait KPI; Pro chart + 7/30/90d) → Task 4. ✅
- Pure, tested lib core → Task 3. ✅
- Curated layout / no drag → Task 6 (and not built anywhere). ✅
- Design polish via frontend-design → Task 6. ✅
- Edge cases (null ready_at excluded, empty window, negative-interval guard, cancelled excluded) → Task 3 tests + Task 4 render guard. ✅
- Slowest movers (stretch) → Task 7. ✅

**Placeholder scan:** No TBD/TODO; every code step shows full code. One intentional cross-task ordering note (Task 4 compiles green only after Task 5) is called out explicitly with a stub option.

**Type consistency:** `WaitPoint`, `avgWaitSeconds`, `waitSeries`, `peakThroughput`, `Speed`/`speed` prop names match across Tasks 3→4→5. `ready_at` added consistently to `StatsOrder` (Task 3) and the orders fetch map (Task 4) and types.ts (Task 1).
