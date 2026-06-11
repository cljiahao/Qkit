import { describe, it, expect } from "vitest";
import { sortActiveOrders } from "./orders";
import type { Order } from "./types";

function order(over: Partial<Order>): Order {
  return {
    id: over.id ?? "id",
    booth_id: over.booth_id ?? "booth",
    order_number: over.order_number ?? "0001",
    customer_name: over.customer_name ?? "Cust",
    items: over.items ?? [],
    total_cents: over.total_cents ?? 0,
    status: over.status ?? "preparing",
    created_at: over.created_at ?? "2026-06-12T10:00:00Z",
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
