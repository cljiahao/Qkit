import { describe, it, expect, vi } from "vitest";

// place_order is reached only after the anti-flood check; stub both RPCs so
// execution flows exactly to the reject/success point under test.
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ rpc }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Map<string, string>(),
}));

import { placeOrder } from "./actions";

const validInput = {
  customerName: "Ada",
  items: [{ menuItemId: "m1", name: "Kopi", price_cents: 200, quantity: 1 }],
};
const IDEM = "11111111-1111-1111-1111-111111111111";

describe("placeOrder", () => {
  it("maps an ORDER_EXPIRED raise to the rescan message", async () => {
    rpc.mockImplementation((name: string) => {
      if (name === "check_rate_limit") return Promise.resolve({ data: true });
      if (name === "place_order")
        return Promise.resolve({
          data: null,
          error: { message: "ORDER_EXPIRED: unknown code" },
        });
      throw new Error(`unexpected rpc: ${name}`);
    });

    const res = await placeOrder("gone", validInput, IDEM);
    expect(res).toEqual({
      success: false,
      error: "This code expired — please rescan.",
    });
  });

  it("returns the order number and booth id on success", async () => {
    rpc.mockImplementation((name: string) => {
      if (name === "check_rate_limit") return Promise.resolve({ data: true });
      if (name === "place_order")
        return Promise.resolve({
          data: { order_number: "0007", booth_id: "b1", access_token: "tok7" },
          error: null,
        });
      throw new Error(`unexpected rpc: ${name}`);
    });

    const res = await placeOrder("code123", validInput, IDEM);
    expect(res).toEqual({
      success: true,
      orderNumber: "0007",
      boothId: "b1",
      accessToken: "tok7",
    });
  });

  it("rejects at the action flood guard without calling place_order", async () => {
    const seen: string[] = [];
    rpc.mockImplementation((name: string) => {
      seen.push(name);
      if (name === "check_rate_limit") return Promise.resolve({ data: false });
      throw new Error(`unexpected rpc: ${name}`);
    });

    const res = await placeOrder("code123", validInput, IDEM);
    expect(res).toEqual({
      success: false,
      error: "Too many orders too fast — wait a moment and try again.",
    });
    // place_order must NOT be reached once the limiter denies.
    expect(seen).toEqual(["check_rate_limit"]);
  });

  it("fails open when the limiter errors (data null) and proceeds to place_order", async () => {
    rpc.mockImplementation((name: string) => {
      if (name === "check_rate_limit")
        return Promise.resolve({ data: null, error: { message: "boom" } });
      if (name === "place_order")
        return Promise.resolve({
          data: { order_number: "0009", booth_id: "b1", access_token: "tok9" },
          error: null,
        });
      throw new Error(`unexpected rpc: ${name}`);
    });

    const res = await placeOrder("code123", validInput, IDEM);
    expect(res).toEqual({
      success: true,
      orderNumber: "0009",
      boothId: "b1",
      accessToken: "tok9",
    });
  });

  it.each([
    [
      "ORDER_UNSERVABLE: booth not serving",
      "This booth isn't taking orders right now",
    ],
    [
      "ORDER_SOLD_OUT: m1",
      "Sorry — an item just sold out. Please adjust your order.",
    ],
    [
      "ORDER_ITEM_UNAVAILABLE: m1",
      "Sorry — an item just sold out. Please adjust your order.",
    ],
    [
      "ORDER_RATE_LIMITED: booth flood",
      "Too many orders too fast — wait a moment and try again.",
    ],
    [
      "ORDER_INVALID: too many items",
      "Could not place order. Please try again.",
    ],
  ])("maps the raise %s to its customer message", async (raise, message) => {
    rpc.mockImplementation((name: string) => {
      if (name === "check_rate_limit") return Promise.resolve({ data: true });
      if (name === "place_order")
        return Promise.resolve({ data: null, error: { message: raise } });
      throw new Error(`unexpected rpc: ${name}`);
    });

    const res = await placeOrder("code123", validInput, IDEM);
    expect(res).toEqual({ success: false, error: message });
  });

  it("returns a generic error when place_order output is malformed", async () => {
    rpc.mockImplementation((name: string) => {
      if (name === "check_rate_limit") return Promise.resolve({ data: true });
      if (name === "place_order")
        // Missing booth_id — the output schema parse fails.
        return Promise.resolve({ data: { order_number: "0007" }, error: null });
      throw new Error(`unexpected rpc: ${name}`);
    });

    const res = await placeOrder("code123", validInput, IDEM);
    expect(res).toEqual({
      success: false,
      error: "Could not place order. Please try again.",
    });
  });

  it("rejects a malformed idempotency key before any RPC", async () => {
    const spy = vi.fn();
    rpc.mockImplementation(spy);
    const res = await placeOrder("code123", validInput, "not-a-uuid");
    expect(res).toEqual({ success: false, error: "Invalid request" });
    expect(spy).not.toHaveBeenCalled();
  });
});
