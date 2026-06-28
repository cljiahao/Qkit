import { describe, it, expect } from "vitest";
import {
  isTerminal,
  sortActiveOrders,
  orderAgeTone,
  elapsedMinutes,
  buildAdvancePatch,
} from "./orders";
import type { Order, OrderStatus } from "./types";

const MIN = 60_000;

function order(over: Partial<Order>): Order {
  return {
    id: over.id ?? "id",
    booth_id: over.booth_id ?? "booth",
    order_number: over.order_number ?? "0001",
    customer_name: over.customer_name ?? "Cust",
    items: over.items ?? [],
    total_cents: over.total_cents ?? 0,
    status: over.status ?? "preparing",
    payment_status: over.payment_status ?? "not_required",
    payment_method_kind: over.payment_method_kind ?? null,
    paid_at: over.paid_at ?? null,
    created_at: over.created_at ?? "2026-06-12T10:00:00Z",
    ready_at: over.ready_at ?? null,
    completed_at: over.completed_at ?? null,
    updated_at: over.updated_at ?? "2026-06-12T10:00:00Z",
  };
}

describe("sortActiveOrders", () => {
  it("puts preparing before ready", () => {
    const out = sortActiveOrders([
      order({ id: "r", status: "ready" }),
      order({ id: "p", status: "preparing" }),
    ]);
    expect(out.map((o) => o.id)).toEqual(["p", "r"]);
  });

  it("FIFO within a status: oldest created_at first", () => {
    const out = sortActiveOrders([
      order({
        id: "new",
        status: "preparing",
        created_at: "2026-06-12T10:05:00Z",
      }),
      order({
        id: "old",
        status: "preparing",
        created_at: "2026-06-12T10:00:00Z",
      }),
    ]);
    expect(out.map((o) => o.id)).toEqual(["old", "new"]);
  });

  it("orders a mixed multi-booth set: all preparing (FIFO) then all ready (FIFO)", () => {
    const out = sortActiveOrders([
      order({
        id: "ready-old",
        booth_id: "b1",
        status: "ready",
        created_at: "2026-06-12T10:01:00Z",
      }),
      order({
        id: "prep-new",
        booth_id: "b2",
        status: "preparing",
        created_at: "2026-06-12T10:09:00Z",
      }),
      order({
        id: "ready-new",
        booth_id: "b2",
        status: "ready",
        created_at: "2026-06-12T10:08:00Z",
      }),
      order({
        id: "prep-old",
        booth_id: "b1",
        status: "preparing",
        created_at: "2026-06-12T10:00:00Z",
      }),
    ]);
    expect(out.map((o) => o.id)).toEqual([
      "prep-old",
      "prep-new",
      "ready-old",
      "ready-new",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [
      order({ id: "r", status: "ready" }),
      order({ id: "p", status: "preparing" }),
    ];
    sortActiveOrders(input);
    expect(input.map((o) => o.id)).toEqual(["r", "p"]);
  });
});

describe("orderAgeTone", () => {
  it("fresh < half target, aging up to target, overdue at/over (10m default)", () => {
    expect(orderAgeTone(2 * MIN)).toBe("fresh");
    expect(orderAgeTone(4 * MIN)).toBe("fresh");
    expect(orderAgeTone(5 * MIN)).toBe("aging");
    expect(orderAgeTone(9 * MIN)).toBe("aging");
    expect(orderAgeTone(10 * MIN)).toBe("overdue");
    expect(orderAgeTone(30 * MIN)).toBe("overdue");
  });

  it("respects a custom target", () => {
    expect(orderAgeTone(2 * MIN, 4)).toBe("aging");
    expect(orderAgeTone(4 * MIN, 4)).toBe("overdue");
  });
});

describe("elapsedMinutes", () => {
  it("floors to whole minutes, never negative", () => {
    expect(elapsedMinutes(90_000)).toBe(1);
    expect(elapsedMinutes(59_000)).toBe(0);
    expect(elapsedMinutes(-5000)).toBe(0);
  });
});

describe("isTerminal", () => {
  it("is true only for completed and cancelled", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
  });

  it("is false for in-flight statuses", () => {
    const live: OrderStatus[] = ["pending", "confirmed", "preparing", "ready"];
    for (const s of live) expect(isTerminal(s)).toBe(false);
  });
});

describe("buildAdvancePatch", () => {
  const NOW = "2026-06-12T04:00:00Z";

  it("stamps ready_at when advancing to ready", () => {
    expect(buildAdvancePatch("ready", NOW)).toEqual({
      status: "ready",
      ready_at: NOW,
    });
  });

  it("stamps completed_at when advancing to completed", () => {
    expect(buildAdvancePatch("completed", NOW)).toEqual({
      status: "completed",
      completed_at: NOW,
    });
  });

  it("stamps no timestamp for other transitions", () => {
    expect(buildAdvancePatch("preparing", NOW)).toEqual({
      status: "preparing",
    });
    expect(buildAdvancePatch("confirmed", NOW)).toEqual({
      status: "confirmed",
    });
  });
});
