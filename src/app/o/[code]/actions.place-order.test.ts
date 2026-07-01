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
          data: { order_number: "0007", booth_id: "b1" },
          error: null,
        });
      throw new Error(`unexpected rpc: ${name}`);
    });

    const res = await placeOrder("code123", validInput, IDEM);
    expect(res).toEqual({
      success: true,
      orderNumber: "0007",
      boothId: "b1",
    });
  });
});
