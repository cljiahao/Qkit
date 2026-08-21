import { describe, it, expect } from "vitest";
import {
  isTerminal,
  sortActiveOrders,
  orderAgeTone,
  elapsedMinutes,
  elapsedLabel,
  orderProgressIndex,
  ORDER_PROGRESS_SEGMENTS,
  buildAdvancePatch,
  ordersAheadOf,
  estimateLabel,
  estimateRangeLabel,
  queuePositionLabel,
  displayOrderNumber,
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
    print_status: over.print_status ?? "not_required",
    print_status_updated_at: over.print_status_updated_at ?? null,
    created_at: over.created_at ?? "2026-06-12T10:00:00Z",
    ready_at: over.ready_at ?? null,
    completed_at: over.completed_at ?? null,
    updated_at: over.updated_at ?? "2026-06-12T10:00:00Z",
    idempotency_key: over.idempotency_key ?? null,
    access_token: over.access_token ?? "tok-test",
    priority_bumped_at: over.priority_bumped_at ?? null,
    source: over.source ?? "qr",
    auto_completed: over.auto_completed ?? false,
  };
}

describe("sortActiveOrders", () => {
  it('defaults to "earliest": oldest created_at first, regardless of status', () => {
    const out = sortActiveOrders([
      order({
        id: "ready-new",
        status: "ready",
        created_at: "2026-06-12T10:05:00Z",
      }),
      order({
        id: "prep-old",
        status: "preparing",
        created_at: "2026-06-12T10:00:00Z",
      }),
    ]);
    // The ready order is newer, but a vendor triaging "who's waited
    // longest" needs the older order first even though its status differs —
    // status is intentionally not part of this ordering (see ordersAheadOf
    // for the status-aware kitchen-priority queue).
    expect(out.map((o) => o.id)).toEqual(["prep-old", "ready-new"]);
  });

  it("orders a mixed multi-booth, mixed-status set purely by age", () => {
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
      "ready-old",
      "ready-new",
      "prep-new",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [
      order({
        id: "r",
        status: "ready",
        created_at: "2026-06-12T10:05:00Z",
      }),
      order({
        id: "p",
        status: "preparing",
        created_at: "2026-06-12T10:00:00Z",
      }),
    ];
    sortActiveOrders(input);
    expect(input.map((o) => o.id)).toEqual(["r", "p"]);
  });

  it("ranks a bumped order ahead of older non-bumped orders", () => {
    const out = sortActiveOrders([
      order({
        id: "old",
        created_at: "2026-06-12T10:00:00Z",
      }),
      order({
        id: "bumped",
        created_at: "2026-06-12T10:05:00Z",
        priority_bumped_at: "2026-06-12T10:06:00Z",
      }),
    ]);
    expect(out.map((o) => o.id)).toEqual(["bumped", "old"]);
  });

  it("ranks multiple bumped orders by most-recently-bumped first", () => {
    const out = sortActiveOrders([
      order({
        id: "bumped-first",
        priority_bumped_at: "2026-06-12T10:00:00Z",
      }),
      order({
        id: "bumped-second",
        priority_bumped_at: "2026-06-12T10:05:00Z",
      }),
    ]);
    expect(out.map((o) => o.id)).toEqual(["bumped-second", "bumped-first"]);
  });

  it("keeps a bumped order ahead even of an older order in a different status", () => {
    const out = sortActiveOrders([
      order({
        id: "ready-old",
        status: "ready",
        created_at: "2026-06-12T09:00:00Z",
      }),
      order({
        id: "prep-bumped",
        status: "preparing",
        created_at: "2026-06-12T10:05:00Z",
        priority_bumped_at: "2026-06-12T10:06:00Z",
      }),
    ]);
    expect(out.map((o) => o.id)).toEqual(["prep-bumped", "ready-old"]);
  });

  it('order: "latest" reverses to newest-first, still status-agnostic', () => {
    const out = sortActiveOrders(
      [
        order({
          id: "old",
          status: "preparing",
          created_at: "2026-06-12T10:00:00Z",
        }),
        order({
          id: "new",
          status: "ready",
          created_at: "2026-06-12T10:05:00Z",
        }),
      ],
      "latest",
    );
    expect(out.map((o) => o.id)).toEqual(["new", "old"]);
  });

  it('order: "latest" still keeps a bumped order first', () => {
    const out = sortActiveOrders(
      [
        order({
          id: "ready-new",
          status: "ready",
          created_at: "2026-06-12T10:05:00Z",
        }),
        order({
          id: "prep-bumped",
          status: "preparing",
          created_at: "2026-06-12T10:01:00Z",
          priority_bumped_at: "2026-06-12T10:02:00Z",
        }),
      ],
      "latest",
    );
    expect(out.map((o) => o.id)).toEqual(["prep-bumped", "ready-new"]);
  });
});

describe("orderAgeTone", () => {
  it("fresh below aging, aging up to overdue, overdue at/over (5m/10m defaults)", () => {
    expect(orderAgeTone(2 * MIN)).toBe("fresh");
    expect(orderAgeTone(4 * MIN)).toBe("fresh");
    expect(orderAgeTone(5 * MIN)).toBe("aging");
    expect(orderAgeTone(9 * MIN)).toBe("aging");
    expect(orderAgeTone(10 * MIN)).toBe("overdue");
    expect(orderAgeTone(30 * MIN)).toBe("overdue");
  });

  it("respects independent aging/overdue thresholds", () => {
    expect(orderAgeTone(3 * MIN, 2, 4)).toBe("aging");
    expect(orderAgeTone(4 * MIN, 2, 4)).toBe("overdue");
    expect(orderAgeTone(1 * MIN, 2, 4)).toBe("fresh");
  });
});

describe("elapsedMinutes", () => {
  it("floors to whole minutes, never negative", () => {
    expect(elapsedMinutes(90_000)).toBe(1);
    expect(elapsedMinutes(59_000)).toBe(0);
    expect(elapsedMinutes(-5000)).toBe(0);
  });
});

describe("elapsedLabel", () => {
  it("says 'just now' under a minute (and for negative clock skew)", () => {
    expect(elapsedLabel(0)).toBe("just now");
    expect(elapsedLabel(59_000)).toBe("just now");
    expect(elapsedLabel(-5000)).toBe("just now");
  });

  it("counts minutes under an hour", () => {
    expect(elapsedLabel(60_000)).toBe("1 min ago");
    expect(elapsedLabel(5 * 60_000)).toBe("5 min ago");
    expect(elapsedLabel(59 * 60_000)).toBe("59 min ago");
  });

  it("switches to hours (+ minutes) at an hour", () => {
    expect(elapsedLabel(60 * 60_000)).toBe("1 hr ago");
    expect(elapsedLabel(80 * 60_000)).toBe("1 hr 20 min ago");
    expect(elapsedLabel(125 * 60_000)).toBe("2 hr 5 min ago");
  });
});

describe("orderProgressIndex", () => {
  it("lights the first segment for the earliest states", () => {
    expect(orderProgressIndex("pending")).toBe(0);
    expect(orderProgressIndex("confirmed")).toBe(0);
  });

  it("advances through preparing and ready/completed", () => {
    expect(orderProgressIndex("preparing")).toBe(1);
    expect(orderProgressIndex("ready")).toBe(2);
    expect(orderProgressIndex("completed")).toBe(2);
  });

  it("has no progress for a cancelled order, and fits the segment count", () => {
    expect(orderProgressIndex("cancelled")).toBe(-1);
    // Every non-cancelled index is a valid segment slot.
    for (const s of [
      "pending",
      "confirmed",
      "preparing",
      "ready",
      "completed",
    ] as const) {
      expect(orderProgressIndex(s)).toBeLessThan(ORDER_PROGRESS_SEGMENTS);
      expect(orderProgressIndex(s)).toBeGreaterThanOrEqual(0);
    }
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

  it("auto-confirms an outstanding payment when completing", () => {
    for (const p of ["pending", "claimed"] as const) {
      expect(buildAdvancePatch("completed", NOW, p)).toEqual({
        status: "completed",
        completed_at: NOW,
        payment_status: "confirmed",
        paid_at: NOW,
      });
    }
  });

  it("leaves payment untouched when completing an already-settled order", () => {
    // not_required / confirmed (or no payment arg) → no payment fields written.
    expect(buildAdvancePatch("completed", NOW, "not_required")).toEqual({
      status: "completed",
      completed_at: NOW,
    });
    expect(buildAdvancePatch("completed", NOW, "confirmed")).toEqual({
      status: "completed",
      completed_at: NOW,
    });
    expect(buildAdvancePatch("completed", NOW)).toEqual({
      status: "completed",
      completed_at: NOW,
    });
  });

  it("does not auto-confirm payment when only advancing to ready", () => {
    expect(buildAdvancePatch("ready", NOW, "claimed")).toEqual({
      status: "ready",
      ready_at: NOW,
    });
  });
});

describe("ordersAheadOf", () => {
  it("counts preparing/ready orders ahead of a pending target", () => {
    const target = order({
      id: "t",
      status: "pending",
      created_at: "2026-06-12T10:05:00Z",
    });
    const others = [
      order({ id: "a", status: "preparing" }),
      order({ id: "b", status: "ready" }),
      target,
    ];
    expect(ordersAheadOf(others, target)).toBe(2);
  });

  it("counts only earlier-created orders within the same rank", () => {
    const target = order({
      id: "t",
      status: "pending",
      created_at: "2026-06-12T10:05:00Z",
    });
    const others = [
      order({
        id: "before",
        status: "pending",
        created_at: "2026-06-12T10:00:00Z",
      }),
      order({
        id: "after",
        status: "pending",
        created_at: "2026-06-12T10:10:00Z",
      }),
      target,
    ];
    expect(ordersAheadOf(others, target)).toBe(1);
  });

  it("excludes the target order itself even if present in the list", () => {
    const target = order({ id: "t", status: "preparing" });
    expect(ordersAheadOf([target], target)).toBe(0);
  });

  it("returns 0 when nothing ranks ahead", () => {
    const target = order({ id: "t", status: "preparing" });
    const other = order({ id: "o", status: "pending" });
    expect(ordersAheadOf([target, other], target)).toBe(0);
  });
});

describe("estimateLabel", () => {
  it("rounds to the nearest minute", () => {
    expect(estimateLabel(150)).toBe("~3 min");
    expect(estimateLabel(89)).toBe("~1 min");
  });

  it("shows a friendly label for a near-zero estimate", () => {
    expect(estimateLabel(0)).toBe("Any moment now");
    expect(estimateLabel(20)).toBe("Any moment now");
  });
});

describe("estimateRangeLabel", () => {
  it("bands ±25% around the point estimate", () => {
    expect(estimateRangeLabel(8 * 60)).toBe("6-10 min");
    expect(estimateRangeLabel(20 * 60)).toBe("15-25 min");
  });

  it("floors the band so a small estimate never degenerates to zero-width", () => {
    expect(estimateRangeLabel(60)).toBe("1-2 min");
  });

  it("shows a friendly label for a near-zero estimate", () => {
    expect(estimateRangeLabel(0)).toBe("Any moment now");
    expect(estimateRangeLabel(20)).toBe("Any moment now");
  });
});

describe("queuePositionLabel", () => {
  it("labels zero orders ahead as next in line", () => {
    expect(queuePositionLabel(0)).toBe("You're next in line");
  });

  it("singularizes exactly one order ahead", () => {
    expect(queuePositionLabel(1)).toBe("1 order ahead of you");
  });

  it("pluralizes multiple orders ahead", () => {
    expect(queuePositionLabel(4)).toBe("4 orders ahead of you");
  });
});

describe("displayOrderNumber", () => {
  it("returns the real order_number when there's no baseline (feature off)", () => {
    expect(displayOrderNumber("0847", null)).toBe("0847");
  });

  it("computes a 1-indexed rank relative to the baseline, zero-padded to 3 digits", () => {
    expect(displayOrderNumber("0001", "0001")).toBe("001");
    expect(displayOrderNumber("0002", "0001")).toBe("002");
    expect(displayOrderNumber("0847", "0845")).toBe("003");
  });

  it("stays stable regardless of later orders completing — pure arithmetic on fixed inputs, not a live recount", () => {
    // Order #0847, whatever the baseline is, gives the same rank every call —
    // nothing here depends on which other orders are still active.
    expect(displayOrderNumber("0847", "0845")).toBe("003");
    expect(displayOrderNumber("0847", "0845")).toBe("003");
  });

  it("grows past 3 digits instead of truncating a rank of 1000+", () => {
    expect(displayOrderNumber("2040", "1000")).toBe("1041");
  });

  it("falls back to the real order_number for a non-positive rank (data inconsistency)", () => {
    expect(displayOrderNumber("0001", "0005")).toBe("0001");
  });
});
