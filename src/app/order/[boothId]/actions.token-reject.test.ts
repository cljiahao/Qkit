import { describe, it, expect, vi } from "vitest";

// The empty-token guard (actions.token.test.ts) never reaches Supabase. This
// covers the OTHER branch: a present-but-wrong token, which can only be judged
// against the booth row's real access_token — so execution must run the rate
// limit, booth fetch, remaining-stock, and servable RPCs before the reject.
// Stubs let it flow exactly that far and no further: the orders insert throws
// if reached, proving the reject happens at isTokenValid, not later.
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    rpc: (name: string) => {
      switch (name) {
        case "check_rate_limit":
          return Promise.resolve({ data: true });
        case "booth_remaining_stock":
          return Promise.resolve({ data: {} });
        case "booth_servable":
          return Promise.resolve({ data: true });
        default:
          throw new Error(`unexpected rpc in token-reject test: ${name}`);
      }
    },
    from: (table: string) => {
      if (table === "booths") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    is_active: true,
                    hours: null,
                    menu_items: [],
                    payment: null,
                    access_token: "REAL-TOKEN",
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      throw new Error(`must not query "${table}" after a wrong-token reject`);
    },
  }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Map() }));

import { placeOrder } from "./actions";

const validInput = {
  customerName: "Ada",
  items: [{ menuItemId: "m1", name: "Kopi", price_cents: 200, quantity: 1 }],
};

describe("placeOrder token guard", () => {
  it("rejects a wrong-but-present token after checking it against the booth row", async () => {
    const res = await placeOrder(
      "11111111-1111-1111-1111-111111111111",
      "WRONG-TOKEN",
      validInput,
    );
    expect(res).toEqual({ success: false, error: expect.any(String) });
  });
});
