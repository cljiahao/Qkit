import { describe, expect, it } from "vitest";
import {
  avgWaitSeconds,
  computeStats,
  pctChange,
  waitSeries,
  peakThroughput,
  windowSeries,
  type StatsOrder,
} from "./stats";

function order(
  status: StatsOrder["status"],
  total_cents: number,
  items: StatsOrder["items"] = [],
  created_at = "2026-06-12T04:00:00Z", // 12:00 SGT
): StatsOrder {
  return { status, total_cents, items, created_at };
}

describe("computeStats", () => {
  it("returns zeros for no orders", () => {
    const s = computeStats([]);
    expect(s.revenue_cents).toBe(0);
    expect(s.orderCount).toBe(0);
    expect(s.aov_cents).toBe(0);
    expect(s.topItems).toEqual([]);
    expect(s.hourly).toHaveLength(24);
    expect(s.hourly.every((b) => b.orders === 0)).toBe(true);
    expect(s.busiestHour).toBeNull();
  });

  it("buckets orders by SGT hour and reports the busiest", () => {
    const s = computeStats([
      order("completed", 500, [], "2026-06-12T04:00:00Z"), // 12:00 SGT
      order("ready", 500, [], "2026-06-12T04:30:00Z"), // 12:30 SGT
      order("completed", 300, [], "2026-06-12T01:00:00Z"), // 09:00 SGT
    ]);
    expect(s.busiestHour).toBe(12);
    expect(s.hourly[12]).toEqual({ hour: 12, orders: 2, revenue_cents: 1000 });
    expect(s.hourly[9]).toEqual({ hour: 9, orders: 1, revenue_cents: 300 });
  });

  it("sums revenue and counts orders, AOV = revenue / count", () => {
    const s = computeStats([order("completed", 500), order("ready", 1500)]);
    expect(s.revenue_cents).toBe(2000);
    expect(s.orderCount).toBe(2);
    expect(s.aov_cents).toBe(1000);
  });

  it("rounds AOV to integer cents", () => {
    const s = computeStats([order("completed", 100), order("completed", 101)]);
    expect(s.aov_cents).toBe(101); // 201 / 2 = 100.5 -> 101
  });

  it("excludes cancelled orders from every metric", () => {
    const s = computeStats([
      order("completed", 1000, [
        { menuItemId: "a", name: "Kopi", price_cents: 1000, quantity: 1 },
      ]),
      order("cancelled", 9999, [
        { menuItemId: "a", name: "Kopi", price_cents: 9999, quantity: 5 },
      ]),
    ]);
    expect(s.revenue_cents).toBe(1000);
    expect(s.orderCount).toBe(1);
    expect(s.topItems).toEqual([
      {
        label: "Kopi",
        quantity: 1,
        revenue_cents: 1000,
        cost_cents: 0,
        profit_cents: 1000,
      },
    ]);
  });

  it("aggregates top items by name, ranks by quantity", () => {
    const s = computeStats([
      order("completed", 0, [
        { menuItemId: "a", name: "Kopi", price_cents: 140, quantity: 2 },
        { menuItemId: "b", name: "Teh", price_cents: 140, quantity: 1 },
      ]),
      order("completed", 0, [
        { menuItemId: "a", name: "Kopi", price_cents: 140, quantity: 3 },
      ]),
    ]);
    expect(s.topItems).toEqual([
      {
        label: "Kopi",
        quantity: 5,
        revenue_cents: 700,
        cost_cents: 0,
        profit_cents: 700,
      },
      {
        label: "Teh",
        quantity: 1,
        revenue_cents: 140,
        cost_cents: 0,
        profit_cents: 140,
      },
    ]);
  });

  it("keys top items by name + options (option-aware)", () => {
    const s = computeStats([
      order("completed", 0, [
        {
          menuItemId: "k",
          name: "Kopi",
          price_cents: 140,
          quantity: 1,
          options: [{ group: "Temperature", choice: "Iced" }],
        },
        {
          menuItemId: "k",
          name: "Kopi",
          price_cents: 140,
          quantity: 1,
          options: [{ group: "Temperature", choice: "Hot" }],
        },
      ]),
    ]);
    const labels = s.topItems.map((t) => t.label).sort();
    expect(labels).toEqual(["Kopi · Hot", "Kopi · Iced"]);
  });

  it("counts unpriced items toward quantity but 0 revenue", () => {
    const s = computeStats([
      order("completed", 0, [{ menuItemId: "w", name: "Water", quantity: 4 }]),
    ]);
    expect(s.topItems).toEqual([
      {
        label: "Water",
        quantity: 4,
        revenue_cents: 0,
        cost_cents: 0,
        profit_cents: 0,
      },
    ]);
  });

  it("respects topN limit", () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      menuItemId: `i${i}`,
      name: `Item ${i}`,
      price_cents: 100,
      quantity: i + 1,
    }));
    const s = computeStats([order("completed", 0, items)], 10);
    expect(s.topItems).toHaveLength(10);
    expect(s.topItems[0].label).toBe("Item 14"); // highest quantity first
  });
});

describe("pctChange", () => {
  it("computes percent change", () => {
    expect(pctChange(150, 100)).toBeCloseTo(50);
    expect(pctChange(80, 100)).toBeCloseTo(-20);
    expect(pctChange(100, 100)).toBe(0);
  });

  it("is null when prior is 0 (undefined growth)", () => {
    expect(pctChange(50, 0)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
  });
});

describe("windowSeries", () => {
  const DAY = 86_400_000;
  const now = Date.parse("2026-06-12T00:00:00Z");

  it("buckets orders into daily slots, newest slot last", () => {
    const s = windowSeries(
      [
        order("completed", 100, [], "2026-06-12T00:00:00Z"), // today (slot 2)
        order("ready", 200, [], "2026-06-11T00:00:00Z"), // 1d ago (slot 1)
        order("completed", 300, [], "2026-06-10T00:00:00Z"), // 2d ago (slot 0)
      ],
      now,
      3,
      DAY,
    );
    expect(s).toHaveLength(3);
    expect(s[2]).toEqual({ t: now, orders: 1, revenue_cents: 100 });
    expect(s[1]).toEqual({ t: now - DAY, orders: 1, revenue_cents: 200 });
    expect(s[0]).toEqual({ t: now - 2 * DAY, orders: 1, revenue_cents: 300 });
  });

  it("stamps each bucket with its right-edge instant, ascending to now", () => {
    const s = windowSeries([], now, 3, DAY);
    expect(s.map((p) => p.t)).toEqual([now - 2 * DAY, now - DAY, now]);
  });

  it("ignores orders outside the window and cancelled orders", () => {
    const s = windowSeries(
      [
        order("completed", 100, [], "2026-06-12T00:00:00Z"),
        order("cancelled", 999, [], "2026-06-12T00:00:00Z"),
        order("completed", 500, [], "2026-06-01T00:00:00Z"), // 11d ago, out
      ],
      now,
      3,
      DAY,
    );
    expect(s[2]).toEqual({ t: now, orders: 1, revenue_cents: 100 });
    expect(s.reduce((n, p) => n + p.orders, 0)).toBe(1);
  });
});

describe("computeStats — fulfilment + cancelled", () => {
  it("counts cancelled and rates fulfilment = completed / (completed + cancelled)", () => {
    const s = computeStats([
      order("completed", 100),
      order("completed", 100),
      order("ready", 100), // in-flight: not completed, not cancelled
      order("cancelled", 100),
    ]);
    expect(s.cancelled).toBe(1);
    // 2 completed / (2 completed + 1 cancelled) = 0.666…
    expect(s.fulfilmentRate).toBeCloseTo(2 / 3);
  });

  it("fulfilment rate is 0 when nothing completed or cancelled", () => {
    const s = computeStats([order("preparing", 100), order("ready", 100)]);
    expect(s.fulfilmentRate).toBe(0);
    expect(s.cancelled).toBe(0);
  });
});

describe("computeStats — day×hour matrix", () => {
  it("is 7×24 and buckets by SGT weekday (row 0 = Mon) and hour", () => {
    // 2026-06-12T04:00:00Z = Fri 12:00 SGT; 2026-06-08T01:00:00Z = Mon 09:00 SGT.
    const s = computeStats([
      order("completed", 100, [], "2026-06-12T04:00:00Z"),
      order("ready", 100, [], "2026-06-12T04:30:00Z"),
      order("completed", 100, [], "2026-06-08T01:00:00Z"),
    ]);
    expect(s.dayHour).toHaveLength(7);
    expect(s.dayHour[0]).toHaveLength(24);
    expect(s.dayHour[4][12]).toBe(2); // Fri 12:00
    expect(s.dayHour[0][9]).toBe(1); // Mon 09:00
    expect(s.dayHour[2][3]).toBe(0); // untouched cell
  });
});

describe("computeStats — option breakdown", () => {
  it("counts selected choices weighted by quantity, ranked desc", () => {
    const s = computeStats([
      order("completed", 0, [
        {
          menuItemId: "k",
          name: "Kopi",
          quantity: 3,
          options: [{ group: "Temperature", choice: "Iced" }],
        },
        {
          menuItemId: "k",
          name: "Kopi",
          quantity: 1,
          options: [{ group: "Temperature", choice: "Hot" }],
        },
      ]),
    ]);
    expect(s.optionBreakdown[0]).toEqual({
      group: "Temperature",
      choice: "Iced",
      count: 3,
    });
    expect(s.optionBreakdown).toContainEqual({
      group: "Temperature",
      choice: "Hot",
      count: 1,
    });
  });
});

describe("computeStats — margins", () => {
  it("is null when no item carries a cost", () => {
    const s = computeStats([
      order("completed", 140, [
        { menuItemId: "k", name: "Kopi", price_cents: 140, quantity: 1 },
      ]),
    ]);
    expect(s.grossMargin).toBeNull();
    expect(s.topItems[0].cost_cents).toBe(0);
  });

  it("computes profit + margin from snapshotted costs", () => {
    const s = computeStats([
      order("completed", 0, [
        {
          menuItemId: "k",
          name: "Kopi",
          price_cents: 200,
          cost_cents: 50,
          quantity: 2,
        },
        {
          menuItemId: "t",
          name: "Teh",
          price_cents: 100,
          cost_cents: 40,
          quantity: 1,
        },
      ]),
    ]);
    // revenue = 200*2 + 100 = 500; cost = 50*2 + 40 = 140; profit = 360.
    expect(s.grossMargin).toEqual({
      revenue_cents: 500,
      cost_cents: 140,
      profit_cents: 360,
      marginPct: (360 / 500) * 100,
    });
    const kopi = s.topItems.find((t) => t.label === "Kopi")!;
    expect(kopi.profit_cents).toBe(300); // 400 - 100
  });

  it("treats a missing cost on one item as 0 (still surfaces margin)", () => {
    const s = computeStats([
      order("completed", 0, [
        {
          menuItemId: "k",
          name: "Kopi",
          price_cents: 200,
          cost_cents: 50,
          quantity: 1,
        },
        { menuItemId: "w", name: "Water", price_cents: 0, quantity: 1 },
      ]),
    ]);
    expect(s.grossMargin).not.toBeNull();
    expect(s.grossMargin!.cost_cents).toBe(50);
    expect(s.grossMargin!.revenue_cents).toBe(200);
  });
});

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
