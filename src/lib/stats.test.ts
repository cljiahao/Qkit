import { describe, expect, it } from "vitest";
import { computeStats, type StatsOrder } from "./stats";

function order(
  status: StatsOrder["status"],
  total_cents: number,
  items: StatsOrder["items"] = [],
): StatsOrder {
  return { status, total_cents, items };
}

describe("computeStats", () => {
  it("returns zeros for no orders", () => {
    const s = computeStats([]);
    expect(s).toEqual({
      revenue_cents: 0,
      orderCount: 0,
      aov_cents: 0,
      topItems: [],
    });
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
      { label: "Kopi", quantity: 1, revenue_cents: 1000 },
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
      { label: "Kopi", quantity: 5, revenue_cents: 700 },
      { label: "Teh", quantity: 1, revenue_cents: 140 },
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
      { label: "Water", quantity: 4, revenue_cents: 0 },
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
