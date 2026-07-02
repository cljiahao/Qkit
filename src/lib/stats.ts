import type { OrderItem, OrderStatus, PaymentStatus } from "@/lib/types";
import { formatOptions, MS_PER_HOUR } from "@/lib/utils";
import { sgtHour, sgtWeekday, WEEKDAY_ORDER } from "@/lib/tz";

// Empty-data convention across this module: rates and waits return `null` (the
// UI renders "—", never a misleading 0), while money and counts return `0`.
// e.g. avgWaitSeconds/waitSeries/pctChange → null; revenue_cents/aov_cents/
// fulfilmentRate/peakThroughput → 0.

export type StatsOrder = {
  status: OrderStatus;
  total_cents: number;
  items: OrderItem[];
  created_at: string;
  ready_at?: string | null;
  // Needed to distinguish a refund (a confirmed-paid order later cancelled) from
  // an ordinary cancellation. Optional so older callers/tests still typecheck.
  payment_status?: PaymentStatus | null;
};

export type TopItem = {
  label: string;
  quantity: number;
  revenue_cents: number;
  cost_cents: number;
  profit_cents: number;
};

export type HourBucket = {
  hour: number; // 0–23, SGT
  orders: number;
  revenue_cents: number;
};

export type OptionCount = { group: string; choice: string; count: number };

export type GrossMargin = {
  revenue_cents: number;
  cost_cents: number;
  profit_cents: number;
  marginPct: number; // profit / revenue * 100
};

export type StatsSummary = {
  revenue_cents: number;
  orderCount: number;
  aov_cents: number;
  cancelled: number;
  // Refunds = orders that were confirmed-paid then cancelled (money collected,
  // then returned). Surfaced for the trail; revenue_cents already excludes them.
  refunds_cents: number;
  refundCount: number;
  fulfilmentRate: number; // 0..1 — completed / (completed + cancelled)
  topItems: TopItem[];
  hourly: HourBucket[]; // always 24 entries, hour 0..23
  busiestHour: number | null; // hour with the most orders, null if none
  dayHour: number[][]; // [7][24] order counts; row 0 = Mon (SGT)
  optionBreakdown: OptionCount[]; // most-selected customization choices
  grossMargin: GrossMargin | null; // null when no item carries a cost
};

/** Label an order line by name plus its selected options, e.g. "Kopi · Iced". */
function itemLabel(item: OrderItem): string {
  const options = formatOptions(item.options);
  return options ? `${item.name} · ${options}` : item.name;
}

/**
 * Percent change of current vs prior. Returns null when prior is 0 — growth
 * from nothing is undefined, and the UI should show "—" rather than ∞/NaN.
 */
export function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

export type SeriesPoint = {
  // Bucket's representative instant (epoch ms) — the right edge of the slot, used
  // for the trend chart's dated X-axis.
  t: number;
  orders: number;
  revenue_cents: number;
};

/**
 * Slot a created_at into a fixed-size window ending nowMs. Returns the bucket
 * index (0 = oldest, buckets-1 = current) or null when the timestamp is
 * unparseable or falls outside the window. Shared by windowSeries + waitSeries
 * so the bucketing math lives (and is tested) in exactly one place.
 */
function bucketIndex(
  createdAt: string,
  nowMs: number,
  buckets: number,
  bucketMs: number,
): number | null {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return null;
  const idx = buckets - 1 - Math.floor((nowMs - t) / bucketMs);
  return idx < 0 || idx >= buckets ? null : idx;
}

/**
 * Bucket orders into a fixed-size time series ending "now" — the trend line.
 * `buckets` slots of `bucketMs` each; index 0 is the oldest slot, the last is
 * the current one. Orders outside the window are ignored. Cancelled excluded.
 * Pure: nowMs is passed in (no Date.now), created_at is parsed deterministically.
 */
export function windowSeries(
  orders: StatsOrder[],
  nowMs: number,
  buckets: number,
  bucketMs: number,
): SeriesPoint[] {
  // idx 0 is the oldest slot, the last is "now". The slot's representative
  // instant is its right edge: nowMs for the last bucket, one bucketMs earlier
  // per step back.
  const series: SeriesPoint[] = Array.from({ length: buckets }, (_, idx) => ({
    t: nowMs - (buckets - 1 - idx) * bucketMs,
    orders: 0,
    revenue_cents: 0,
  }));
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const idx = bucketIndex(o.created_at, nowMs, buckets, bucketMs);
    if (idx === null) continue;
    series[idx].orders += 1;
    series[idx].revenue_cents += o.total_cents;
  }
  return series;
}

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
    const idx = bucketIndex(o.created_at, nowMs, buckets, bucketMs);
    if (idx === null) continue;
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

/**
 * Busiest single clock-hour's order count (non-cancelled). 0 if none.
 * Buckets on the absolute epoch-hour grid; since SGT is a whole-hour offset
 * (UTC+8), these boundaries coincide with SGT :00 and the count is unaffected
 * by timezone — only a *labelled* hour would shift, and this returns a count.
 */
export function peakThroughput(orders: StatsOrder[]): number {
  const byHour = new Map<number, number>();
  let peak = 0;
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const t = Date.parse(o.created_at);
    if (!Number.isFinite(t)) continue;
    const slot = Math.floor(t / MS_PER_HOUR);
    const n = (byHour.get(slot) ?? 0) + 1;
    byHour.set(slot, n);
    if (n > peak) peak = n;
  }
  return peak;
}

/**
 * Aggregate order rows into KPIs, patterns, and (cost-aware) margins. Cancelled
 * orders are excluded from revenue/items but counted for the fulfilment rate.
 * Pure: no DB, no React, no Date — unit-testable.
 */
export function computeStats(orders: StatsOrder[], topN = 10): StatsSummary {
  const counted = orders.filter((o) => o.status !== "cancelled");
  const cancelled = orders.length - counted.length;
  const completed = counted.filter((o) => o.status === "completed").length;
  const fulfilmentDenom = completed + cancelled;
  const fulfilmentRate = fulfilmentDenom ? completed / fulfilmentDenom : 0;

  // A confirmed-paid order that was then cancelled = a refund. The money left
  // revenue (it's cancelled), so record it as a refund for the audit trail
  // rather than letting it vanish silently.
  let refunds_cents = 0;
  let refundCount = 0;
  for (const o of orders) {
    if (o.status === "cancelled" && o.payment_status === "confirmed") {
      refunds_cents += o.total_cents;
      refundCount += 1;
    }
  }

  const revenue_cents = counted.reduce((sum, o) => sum + o.total_cents, 0);
  const orderCount = counted.length;
  const aov_cents = orderCount ? Math.round(revenue_cents / orderCount) : 0;

  const byLabel = new Map<string, TopItem>();
  const optionMap = new Map<string, OptionCount>();
  const hourly: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: 0,
    revenue_cents: 0,
  }));
  const dayHour: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  );

  let anyCost = false;
  let itemRevenue = 0;
  let itemCost = 0;

  for (const order of counted) {
    const hour = sgtHour(order.created_at);
    hourly[hour].orders += 1;
    hourly[hour].revenue_cents += order.total_cents;
    dayHour[WEEKDAY_ORDER.indexOf(sgtWeekday(order.created_at))][hour] += 1;

    for (const item of order.items) {
      const label = itemLabel(item);
      const revenue = (item.price_cents ?? 0) * item.quantity;
      if (item.cost_cents != null) anyCost = true;
      const cost = (item.cost_cents ?? 0) * item.quantity;
      itemRevenue += revenue;
      itemCost += cost;

      const existing = byLabel.get(label);
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenue_cents += revenue;
        existing.cost_cents += cost;
        existing.profit_cents += revenue - cost;
      } else {
        byLabel.set(label, {
          label,
          quantity: item.quantity,
          revenue_cents: revenue,
          cost_cents: cost,
          profit_cents: revenue - cost,
        });
      }

      for (const opt of item.options ?? []) {
        const key = `${opt.group}${opt.choice}`;
        const oc = optionMap.get(key);
        if (oc) oc.count += item.quantity;
        else
          optionMap.set(key, {
            group: opt.group,
            choice: opt.choice,
            count: item.quantity,
          });
      }
    }
  }

  const topItems = [...byLabel.values()]
    .sort(
      (a, b) => b.quantity - a.quantity || b.revenue_cents - a.revenue_cents,
    )
    .slice(0, topN);

  const optionBreakdown = [...optionMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);

  // Peak by order count; earliest hour wins a tie (stable, deterministic).
  let busiestHour: number | null = null;
  let peak = 0;
  for (const b of hourly) {
    if (b.orders > peak) {
      peak = b.orders;
      busiestHour = b.hour;
    }
  }

  // Margin only when at least one item carried a cost — otherwise profit would
  // falsely equal revenue. Revenue here is item-level (matches the cost basis).
  const grossMargin: GrossMargin | null = anyCost
    ? {
        revenue_cents: itemRevenue,
        cost_cents: itemCost,
        profit_cents: itemRevenue - itemCost,
        marginPct: itemRevenue
          ? ((itemRevenue - itemCost) / itemRevenue) * 100
          : 0,
      }
    : null;

  return {
    revenue_cents,
    orderCount,
    aov_cents,
    cancelled,
    refunds_cents,
    refundCount,
    fulfilmentRate,
    topItems,
    hourly,
    busiestHour,
    dayHour,
    optionBreakdown,
    grossMargin,
  };
}
