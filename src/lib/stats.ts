import type { OrderItem, OrderStatus } from "@/lib/types";
import { formatOptions } from "@/lib/utils";
import { sgtHour } from "@/lib/tz";

export type StatsOrder = {
  status: OrderStatus;
  total_cents: number;
  items: OrderItem[];
  created_at: string;
};

export type TopItem = {
  label: string;
  quantity: number;
  revenue_cents: number;
};

export type HourBucket = {
  hour: number; // 0–23, SGT
  orders: number;
  revenue_cents: number;
};

export type StatsSummary = {
  revenue_cents: number;
  orderCount: number;
  aov_cents: number;
  topItems: TopItem[];
  hourly: HourBucket[]; // always 24 entries, hour 0..23
  busiestHour: number | null; // hour with the most orders, null if none
};

/** Label an order line by name plus its selected options, e.g. "Kopi · Iced". */
function itemLabel(item: OrderItem): string {
  const options = formatOptions(item.options);
  return options ? `${item.name} · ${options}` : item.name;
}

/**
 * Aggregate order rows into KPIs + top items. Cancelled orders are excluded
 * from every metric. Pure: no DB, no React, no Date — unit-testable.
 */
export function computeStats(orders: StatsOrder[], topN = 10): StatsSummary {
  const counted = orders.filter((o) => o.status !== "cancelled");

  const revenue_cents = counted.reduce((sum, o) => sum + o.total_cents, 0);
  const orderCount = counted.length;
  const aov_cents = orderCount ? Math.round(revenue_cents / orderCount) : 0;

  const byLabel = new Map<string, TopItem>();
  const hourly: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: 0,
    revenue_cents: 0,
  }));

  for (const order of counted) {
    const bucket = hourly[sgtHour(order.created_at)];
    bucket.orders += 1;
    bucket.revenue_cents += order.total_cents;

    for (const item of order.items) {
      const label = itemLabel(item);
      const existing = byLabel.get(label);
      const revenue = (item.price_cents ?? 0) * item.quantity;
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenue_cents += revenue;
      } else {
        byLabel.set(label, {
          label,
          quantity: item.quantity,
          revenue_cents: revenue,
        });
      }
    }
  }

  const topItems = [...byLabel.values()]
    .sort(
      (a, b) => b.quantity - a.quantity || b.revenue_cents - a.revenue_cents,
    )
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

  return {
    revenue_cents,
    orderCount,
    aov_cents,
    topItems,
    hourly,
    busiestHour,
  };
}
