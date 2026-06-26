import { describe, expect, it } from "vitest";
import {
  applyRealtimeOrderEvent,
  parseRealtimeOrderEvent,
  type RealtimeOrderEvent,
} from "./realtime-orders";
import type { Order } from "./types";

function row(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    booth_id: "b1",
    order_number: "0001",
    customer_name: "Priya",
    items: [{ menuItemId: "m1", name: "Flat White", quantity: 1 }],
    status: "preparing",
    total_cents: 550,
    created_at: "2026-06-12T04:00:00Z",
    ready_at: null,
    completed_at: null,
    updated_at: "2026-06-12T04:00:00Z",
    ...overrides,
  };
}

describe("parseRealtimeOrderEvent", () => {
  it("parses a valid INSERT into a typed event", () => {
    const order = row();
    const event = parseRealtimeOrderEvent({
      eventType: "INSERT",
      new: order,
      old: {},
    });
    expect(event).toEqual({ type: "INSERT", order });
  });

  it("parses a valid UPDATE into a typed event", () => {
    const order = row({ status: "ready", ready_at: "2026-06-12T04:05:00Z" });
    const event = parseRealtimeOrderEvent({
      eventType: "UPDATE",
      new: order,
      old: {},
    });
    expect(event).toEqual({ type: "UPDATE", order });
  });

  it("parses a DELETE from old.id only (no schema needed)", () => {
    const event = parseRealtimeOrderEvent({
      eventType: "DELETE",
      new: {},
      old: { id: "o9" },
    });
    expect(event).toEqual({ type: "DELETE", id: "o9" });
  });

  it("drops a DELETE without a string id", () => {
    expect(
      parseRealtimeOrderEvent({ eventType: "DELETE", new: {}, old: {} }),
    ).toBeNull();
  });

  it("drops an INSERT/UPDATE whose payload fails the schema", () => {
    const bad = { ...row(), total_cents: -1 }; // negative fails nonnegative()
    expect(
      parseRealtimeOrderEvent({ eventType: "INSERT", new: bad, old: {} }),
    ).toBeNull();
    expect(
      parseRealtimeOrderEvent({
        eventType: "UPDATE",
        new: { junk: true },
        old: {},
      }),
    ).toBeNull();
  });

  it("drops an unknown event type", () => {
    expect(
      parseRealtimeOrderEvent({ eventType: "TRUNCATE", new: row(), old: {} }),
    ).toBeNull();
  });
});

describe("applyRealtimeOrderEvent", () => {
  const a = row({ id: "a" });
  const b = row({ id: "b" });

  it("prepends an INSERT (newest first)", () => {
    const next = applyRealtimeOrderEvent([a], {
      type: "INSERT",
      order: b,
    });
    expect(next.map((o) => o.id)).toEqual(["b", "a"]);
  });

  it("replaces the matching order on UPDATE, leaving others", () => {
    const updated = row({ id: "a", status: "ready" });
    const next = applyRealtimeOrderEvent([a, b], {
      type: "UPDATE",
      order: updated,
    });
    expect(next[0].status).toBe("ready");
    expect(next[1]).toBe(b);
  });

  it("is a no-op UPDATE when no id matches", () => {
    const ghost = row({ id: "z", status: "completed" });
    const event: RealtimeOrderEvent = { type: "UPDATE", order: ghost };
    expect(applyRealtimeOrderEvent([a, b], event)).toEqual([a, b]);
  });

  it("removes the matching order on DELETE", () => {
    const next = applyRealtimeOrderEvent([a, b], { type: "DELETE", id: "a" });
    expect(next.map((o) => o.id)).toEqual(["b"]);
  });
});
