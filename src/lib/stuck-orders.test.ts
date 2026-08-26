import { describe, expect, it } from "vitest";
import {
  STUCK_THRESHOLD_MS,
  statusSinceByOrder,
  findStuckOrders,
} from "./stuck-orders";

const NOW = Date.parse("2026-06-11T12:00:00Z");
const minsAgo = (n: number) => new Date(NOW - n * 60_000).toISOString();

describe("statusSinceByOrder", () => {
  it("falls back to created_at when an order has no events at all", () => {
    const m = statusSinceByOrder(
      [{ id: "o1", status: "pending", created_at: minsAgo(45) }],
      [],
    );
    expect(m.get("o1")).toBe(minsAgo(45));
  });

  it("uses the latest matching event's created_at as the status start time", () => {
    const m = statusSinceByOrder(
      [{ id: "o1", status: "preparing", created_at: minsAgo(60) }],
      [
        {
          order_id: "o1",
          to_status: "confirmed",
          created_at: minsAgo(50),
        },
        {
          order_id: "o1",
          to_status: "preparing",
          created_at: minsAgo(20),
        },
      ],
    );
    expect(m.get("o1")).toBe(minsAgo(20));
  });

  it("falls back to created_at when the latest event's to_status doesn't match the order's live status", () => {
    // Simulates recordOrderStatusEvent's best-effort write silently failing
    // (or racing) after a real status advance — the trail is untrustworthy,
    // so treat it as if there were no event.
    const m = statusSinceByOrder(
      [{ id: "o1", status: "ready", created_at: minsAgo(90) }],
      [{ order_id: "o1", to_status: "preparing", created_at: minsAgo(40) }],
    );
    expect(m.get("o1")).toBe(minsAgo(90));
  });

  it("ignores events belonging to other orders", () => {
    const m = statusSinceByOrder(
      [{ id: "o1", status: "pending", created_at: minsAgo(10) }],
      [{ order_id: "other", to_status: "pending", created_at: minsAgo(5) }],
    );
    expect(m.get("o1")).toBe(minsAgo(10));
  });
});

describe("findStuckOrders", () => {
  it("flags a non-terminal order past the 30-minute threshold, for each non-terminal status", () => {
    const statuses = ["pending", "confirmed", "preparing", "ready"] as const;
    for (const status of statuses) {
      const result = findStuckOrders(
        [{ id: "o1", booth_id: "b1", status, status_since: minsAgo(31) }],
        NOW,
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("o1");
      expect(result[0].stuckForMs).toBeGreaterThan(STUCK_THRESHOLD_MS);
    }
  });

  it("does not flag an order well within its status window", () => {
    const result = findStuckOrders(
      [
        {
          id: "o1",
          booth_id: "b1",
          status: "preparing",
          status_since: minsAgo(5),
        },
      ],
      NOW,
    );
    expect(result).toHaveLength(0);
  });

  it("never flags a completed or cancelled order regardless of age", () => {
    const result = findStuckOrders(
      [
        {
          id: "o1",
          booth_id: "b1",
          status: "completed",
          status_since: minsAgo(9999),
        },
        {
          id: "o2",
          booth_id: "b1",
          status: "cancelled",
          status_since: minsAgo(9999),
        },
      ],
      NOW,
    );
    expect(result).toHaveLength(0);
  });

  it("sorts longest-stuck first", () => {
    const result = findStuckOrders(
      [
        {
          id: "o1",
          booth_id: "b1",
          status: "preparing",
          status_since: minsAgo(35),
        },
        {
          id: "o2",
          booth_id: "b1",
          status: "ready",
          status_since: minsAgo(120),
        },
      ],
      NOW,
    );
    expect(result.map((o) => o.id)).toEqual(["o2", "o1"]);
  });

  it("returns an empty list for no orders", () => {
    expect(findStuckOrders([], NOW)).toEqual([]);
  });
});
