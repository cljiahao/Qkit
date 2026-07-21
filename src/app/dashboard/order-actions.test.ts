import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  advanceOrder,
  confirmOrderPayment,
  cancelOrder,
  bumpOrder,
  restoreAutoCompleted,
  sweepReadyOrders,
} from "./order-actions";

// Mock the supabase server client's fluent chain and the vendor gate. Two
// chains hang off `from("orders")`: a read (select→eq→maybeSingle) and a write
// (update→eq→eq→select). `maybeSingle` is set per-test to the "current" order
// row; `updateSelect` returns the updated rows — [] models a concurrent change
// that the status/payment guard filtered out. `from("vendors")` is a separate
// branch (select→eq→maybeSingle) for sweepReadyOrders' board_settings read;
// `update(...)` on the orders branch also exposes a `.eq().lt(...)` chain for
// the sweep's bulk update alongside the existing `.eq().eq().select(...)`.
const {
  getUserMock,
  maybeSingle,
  update,
  updateSelect,
  vendorSingle,
  sweepLt,
} = vi.hoisted(() => {
  const updateSelect = vi.fn();
  const sweepLt = vi.fn();
  const vendorSingle = vi.fn();
  return {
    getUserMock: vi.fn(),
    maybeSingle: vi.fn(),
    update: vi.fn(() => ({
      eq: () => ({
        eq: () => ({ select: updateSelect }),
        lt: sweepLt,
      }),
    })),
    updateSelect,
    vendorSingle,
    sweepLt,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () =>
    Promise.resolve({
      from: (table: string) => {
        if (table === "vendors")
          return {
            select: () => ({ eq: () => ({ maybeSingle: vendorSingle }) }),
          };
        return {
          select: () => ({ eq: () => ({ maybeSingle }) }),
          update,
        };
      },
    }),
}));
vi.mock("@/lib/supabase/get-user", () => ({ getUser: getUserMock }));

const ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ id: "v1" });
  maybeSingle.mockReset();
  update.mockClear();
  // Default: the guarded UPDATE matched its row (1 row back).
  updateSelect
    .mockReset()
    .mockResolvedValue({ data: [{ id: ID }], error: null });
  // board_settings is always the full object in the DB (0065_ready_auto_clear
  // sets a complete JSONB default) — boardSettingsSchema validates all its
  // fields, not just ready_auto_clear_min, so the mock must be complete too.
  vendorSingle.mockReset().mockResolvedValue({
    data: {
      board_settings: {
        aging_min: 5,
        overdue_min: 10,
        sound_id: "chime",
        desktop_notify: false,
        undo_seconds: 4,
        daily_order_number_reset: false,
        show_wait_estimate: true,
        default_prep_minutes: null,
        ready_auto_clear_min: 3,
      },
    },
  });
  sweepLt.mockReset().mockResolvedValue({ error: null });
});

describe("advanceOrder", () => {
  it("advances preparing → ready and stamps ready_at", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "not_required" },
    });
    const res = await advanceOrder(ID);
    expect(res).toEqual({ success: true, status: "ready" });
    expect(update).toHaveBeenCalledWith({
      status: "ready",
      ready_at: expect.any(String),
    });
  });

  it("auto-confirms an outstanding payment on completion", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "ready", payment_status: "claimed" },
    });
    const res = await advanceOrder(ID);
    expect(res).toEqual({ success: true, status: "completed" });
    expect(update).toHaveBeenCalledWith({
      status: "completed",
      completed_at: expect.any(String),
      payment_status: "confirmed",
      paid_at: expect.any(String),
    });
  });

  it("rejects an order with no legal forward move", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "completed", payment_status: "confirmed" },
    });
    const res = await advanceOrder(ID);
    expect(res.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an invalid order id before touching the DB", async () => {
    const res = await advanceOrder("not-a-uuid");
    expect(res.success).toBe(false);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("rejects when not signed in", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await advanceOrder(ID);
    expect(res.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a refresh when the status changed concurrently (0 rows)", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "not_required" },
    });
    // The guarded UPDATE matched nothing — another action moved the order.
    updateSelect.mockResolvedValue({ data: [], error: null });
    const res = await advanceOrder(ID);
    expect(res).toEqual({
      success: false,
      error: "Order changed — please refresh.",
    });
  });
});

describe("confirmOrderPayment", () => {
  it("confirms a claimed order and stamps paid_at", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "ready", payment_status: "claimed" },
    });
    const res = await confirmOrderPayment(ID);
    expect(res).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({
      payment_status: "confirmed",
      paid_at: expect.any(String),
    });
  });

  it("is idempotent when already confirmed (no write)", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "ready", payment_status: "confirmed" },
    });
    const res = await confirmOrderPayment(ID);
    expect(res).toEqual({ success: true });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an order that doesn't take payment", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "ready", payment_status: "not_required" },
    });
    const res = await confirmOrderPayment(ID);
    expect(res.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("cancelOrder", () => {
  it("cancels a live order", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "pending" },
    });
    const res = await cancelOrder(ID);
    expect(res).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({ status: "cancelled" });
  });

  it("rejects a terminal order", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "completed", payment_status: "confirmed" },
    });
    const res = await cancelOrder(ID);
    expect(res.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a paid (confirmed-payment) live order — no refund rail", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "confirmed" },
    });
    const res = await cancelOrder(ID);
    expect(res).toEqual({
      success: false,
      error: "Paid orders can't be cancelled. Refund the customer directly.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a refresh when the order advanced concurrently (0 rows)", async () => {
    // A cancellable (non-confirmed-payment) order that reaches the guarded
    // UPDATE, which then matches nothing because it moved concurrently.
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "ready", payment_status: "claimed" },
    });
    updateSelect.mockResolvedValue({ data: [], error: null });
    const res = await cancelOrder(ID);
    expect(res).toEqual({
      success: false,
      error: "Order changed — please refresh.",
    });
  });
});

describe("bumpOrder", () => {
  it("bumps a live order to the front of its status lane", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "not_required" },
    });
    const res = await bumpOrder(ID);
    expect(res).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({
      priority_bumped_at: expect.any(String),
    });
  });

  it("rejects a terminal order", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "completed", payment_status: "confirmed" },
    });
    const res = await bumpOrder(ID);
    expect(res.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an invalid order id before touching the DB", async () => {
    const res = await bumpOrder("not-a-uuid");
    expect(res.success).toBe(false);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("reports a refresh when the order changed concurrently (0 rows)", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "not_required" },
    });
    updateSelect.mockResolvedValue({ data: [], error: null });
    const res = await bumpOrder(ID);
    expect(res).toEqual({
      success: false,
      error: "Order changed — please refresh.",
    });
  });
});

describe("restoreAutoCompleted", () => {
  it("restores an auto-cleared order back to ready", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "completed",
        payment_status: "not_required",
        auto_completed: true,
      },
    });
    const res = await restoreAutoCompleted(ID);
    expect(res).toEqual({ success: true, status: "ready" });
    expect(update).toHaveBeenCalledWith({
      status: "ready",
      ready_at: expect.any(String),
      completed_at: null,
      auto_completed: false,
    });
  });

  it("rejects an order the vendor completed manually", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "completed",
        payment_status: "not_required",
        auto_completed: false,
      },
    });
    const res = await restoreAutoCompleted(ID);
    expect(res.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an order that isn't completed at all", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "ready",
        payment_status: "not_required",
        auto_completed: false,
      },
    });
    const res = await restoreAutoCompleted(ID);
    expect(res.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a refresh when the order changed concurrently (0 rows)", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "completed",
        payment_status: "not_required",
        auto_completed: true,
      },
    });
    updateSelect.mockResolvedValue({ data: [], error: null });
    const res = await restoreAutoCompleted(ID);
    expect(res).toEqual({
      success: false,
      error: "Order changed — please refresh.",
    });
  });
});

describe("sweepReadyOrders", () => {
  it("sweeps ready orders older than the vendor's configured minutes", async () => {
    await sweepReadyOrders();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", auto_completed: true }),
    );
    expect(sweepLt).toHaveBeenCalledWith("ready_at", expect.any(String));
  });

  it("does nothing when the vendor has disabled the sweep (null)", async () => {
    vendorSingle.mockResolvedValue({
      data: {
        board_settings: {
          aging_min: 5,
          overdue_min: 10,
          sound_id: "chime",
          desktop_notify: false,
          undo_seconds: 4,
          daily_order_number_reset: false,
          show_wait_estimate: true,
          default_prep_minutes: null,
          ready_auto_clear_min: null,
        },
      },
    });
    await sweepReadyOrders();
    expect(sweepLt).not.toHaveBeenCalled();
  });

  it("does nothing when not signed in", async () => {
    getUserMock.mockResolvedValue(null);
    await sweepReadyOrders();
    expect(vendorSingle).not.toHaveBeenCalled();
  });
});
