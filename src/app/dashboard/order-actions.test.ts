import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  advanceOrder,
  confirmOrderPayment,
  cancelOrder,
} from "./order-actions";

// Mock the supabase server client's fluent chain and the vendor gate. Two
// chains hang off `from("orders")`: a read (select→eq→maybeSingle) and a write
// (update→eq→eq→select). `maybeSingle` is set per-test to the "current" order
// row; `updateSelect` returns the updated rows — [] models a concurrent change
// that the status/payment guard filtered out.
const { getVendorMock, maybeSingle, update, updateSelect } = vi.hoisted(() => {
  const updateSelect = vi.fn();
  return {
    getVendorMock: vi.fn(),
    maybeSingle: vi.fn(),
    update: vi.fn(() => ({
      eq: () => ({ eq: () => ({ select: updateSelect }) }),
    })),
    updateSelect,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () =>
    Promise.resolve({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle }) }),
        update,
      }),
    }),
}));
vi.mock("@/lib/supabase/get-vendor", () => ({ getVendor: getVendorMock }));

const ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  getVendorMock
    .mockReset()
    .mockResolvedValue({ user: { id: "v1" }, vendor: {} });
  maybeSingle.mockReset();
  update.mockClear();
  // Default: the guarded UPDATE matched its row (1 row back).
  updateSelect
    .mockReset()
    .mockResolvedValue({ data: [{ id: ID }], error: null });
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
    expect(getVendorMock).not.toHaveBeenCalled();
  });

  it("rejects when not signed in", async () => {
    getVendorMock.mockResolvedValue({ user: null, vendor: null });
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

  it("reports a refresh when the order advanced concurrently (0 rows)", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "ready", payment_status: "confirmed" },
    });
    updateSelect.mockResolvedValue({ data: [], error: null });
    const res = await cancelOrder(ID);
    expect(res).toEqual({
      success: false,
      error: "Order changed — please refresh.",
    });
  });
});
