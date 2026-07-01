import { describe, it, expect, vi } from "vitest";

// The token guard must reject BEFORE any Supabase call. We mock the server
// client to throw if touched, proving the guard short-circuits first.
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => {
    throw new Error("must not reach Supabase on an invalid token");
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Map() }));

import { placeOrder } from "./actions";

const validInput = {
  customerName: "Ada",
  items: [{ menuItemId: "m1", name: "Kopi", price_cents: 200, quantity: 1 }],
};

describe("placeOrder token guard", () => {
  it("rejects a missing token without touching Supabase", async () => {
    const res = await placeOrder(
      "11111111-1111-1111-1111-111111111111",
      "",
      validInput,
    );
    expect(res).toEqual({ success: false, error: expect.any(String) });
  });
});
