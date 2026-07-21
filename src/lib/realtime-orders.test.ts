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
    payment_status: "not_required",
    payment_method_kind: null,
    paid_at: null,
    created_at: "2026-06-12T04:00:00Z",
    ready_at: null,
    completed_at: null,
    updated_at: "2026-06-12T04:00:00Z",
    idempotency_key: null,
    access_token: "tok-test",
    priority_bumped_at: null,
    source: "qr",
    auto_completed: false,
    ...overrides,
  };
}

describe("parseRealtimeOrderEvent", () => {
  it("parses a valid INSERT into a typed event, stripping access_token", () => {
    const { access_token: _accessToken, ...expected } = row();
    const event = parseRealtimeOrderEvent({
      eventType: "INSERT",
      new: row(),
      old: {},
    });
    expect(event).toEqual({ type: "INSERT", order: expected });
  });

  it("parses a valid UPDATE into a typed event, stripping access_token", () => {
    const full = row({ status: "ready", ready_at: "2026-06-12T04:05:00Z" });
    const { access_token: _accessToken, ...expected } = full;
    const event = parseRealtimeOrderEvent({
      eventType: "UPDATE",
      new: full,
      old: {},
    });
    expect(event).toEqual({ type: "UPDATE", order: expected });
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

  it("never exposes access_token on the parsed order, even though the raw row carries it", () => {
    const event = parseRealtimeOrderEvent({
      eventType: "INSERT",
      new: row(),
      old: {},
    });
    expect(event?.type).toBe("INSERT");
    expect(
      event && "order" in event ? "access_token" in event.order : true,
    ).toBe(false);
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
