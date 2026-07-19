import { describe, expect, it, vi, beforeEach } from "vitest";
import { placeWalkupOrder } from "./walkup-actions";
import type { PlaceOrderInput } from "@/lib/schemas";

const { rpcMock, createServerClientMock } = vi.hoisted(() => {
  const rpcMock = vi.fn();
  return {
    rpcMock,
    createServerClientMock: vi.fn(() => Promise.resolve({ rpc: rpcMock })),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: createServerClientMock,
}));

const BOOTH_ID = "00000000-0000-4000-8000-000000000001";

function makeInput(over: Partial<PlaceOrderInput> = {}): PlaceOrderInput {
  return {
    customerName: "Ada",
    items: [{ menuItemId: "m1", name: "Kopi", quantity: 2 }],
    ...over,
  };
}

beforeEach(() => {
  rpcMock.mockReset();
  createServerClientMock.mockClear();
});

describe("placeWalkupOrder", () => {
  it("rejects an invalid booth id without calling the RPC", async () => {
    const res = await placeWalkupOrder("not-a-uuid", makeInput(), false);
    expect(res).toEqual({ success: false, error: "Invalid booth" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects invalid order details (schema) without calling the RPC", async () => {
    const res = await placeWalkupOrder(
      BOOTH_ID,
      makeInput({ items: [] }),
      false,
    );
    expect(res).toEqual({ success: false, error: "Invalid order details" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("calls place_walkup_order with the booth id, name, items, and paid flag", async () => {
    rpcMock.mockResolvedValue({
      data: { order_number: "0001", access_token: "tok" },
      error: null,
    });
    const input = makeInput();

    const res = await placeWalkupOrder(BOOTH_ID, input, false);

    expect(rpcMock).toHaveBeenCalledWith("place_walkup_order", {
      p_booth_id: BOOTH_ID,
      p_customer_name: input.customerName,
      p_items: input.items,
      p_paid: false,
    });
    expect(res).toEqual({
      success: true,
      orderNumber: "0001",
      accessToken: "tok",
    });
  });

  it("passes paid=true through to p_paid", async () => {
    rpcMock.mockResolvedValue({
      data: { order_number: "0001", access_token: "tok" },
      error: null,
    });
    await placeWalkupOrder(BOOTH_ID, makeInput(), true);

    expect(rpcMock).toHaveBeenCalledWith(
      "place_walkup_order",
      expect.objectContaining({ p_paid: true }),
    );
  });

  it("maps ORDER_UNAUTHORIZED to a not-your-booth message", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "ORDER_UNAUTHORIZED: not your booth" },
    });
    const res = await placeWalkupOrder(BOOTH_ID, makeInput(), false);
    expect(res).toEqual({ success: false, error: "Not your booth." });
  });

  it("maps ORDER_SOLD_OUT to a sold-out message", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "ORDER_SOLD_OUT: m1" },
    });
    const res = await placeWalkupOrder(BOOTH_ID, makeInput(), false);
    expect(res).toEqual({
      success: false,
      error: "An item just sold out. Adjust the order.",
    });
  });

  it("maps ORDER_RATE_LIMITED to a rate-limit message", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "ORDER_RATE_LIMITED: booth flood" },
    });
    const res = await placeWalkupOrder(BOOTH_ID, makeInput(), false);
    expect(res).toEqual({
      success: false,
      error: "Too many orders too fast. Wait a moment and try again.",
    });
  });

  it("falls back to a generic message and logs on an unrecognized error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const res = await placeWalkupOrder(BOOTH_ID, makeInput(), false);
    expect(res).toEqual({
      success: false,
      error: "Could not place order. Please try again.",
    });
    expect(errorSpy).toHaveBeenCalledWith("placeWalkupOrder failed", "boom");
    errorSpy.mockRestore();
  });

  it("handles a malformed RPC success payload", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcMock.mockResolvedValue({ data: { unexpected: true }, error: null });
    const res = await placeWalkupOrder(BOOTH_ID, makeInput(), false);
    expect(res).toEqual({
      success: false,
      error: "Could not place order. Please try again.",
    });
    errorSpy.mockRestore();
  });
});
