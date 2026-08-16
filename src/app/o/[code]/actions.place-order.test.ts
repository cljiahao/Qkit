import { describe, it, expect, vi, beforeEach } from "vitest";

// place_order is reached only after the anti-flood check; stub both RPCs so
// execution flows exactly to the reject/success point under test.
const rpc = vi.fn();

// Service-role lookups for the post-order Telegram alert: booths -> vendor_id
// -> vendor_telegram -> orders (total_cents). Each test configures the three
// queues it needs; defaults resolve to "not found" so tests that don't care
// about Telegram at all (the pre-existing ones above) just no-op through it.
let boothQueue: { data: unknown }[] = [];
let vendorTelegramQueue: { data: unknown }[] = [];
let orderQueue: { data: unknown }[] = [];
const serviceFrom = vi.fn((table: string) => {
  if (table === "booths") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve(boothQueue.shift() ?? { data: null }),
        }),
      }),
    };
  }
  if (table === "vendor_telegram") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve(vendorTelegramQueue.shift() ?? { data: null }),
        }),
      }),
    };
  }
  if (table === "orders") {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve(orderQueue.shift() ?? { data: null }),
          }),
        }),
      }),
    };
  }
  throw new Error(`unexpected table: ${table}`);
});

const sendTelegramMessage = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ rpc }),
  createServiceClient: async () => ({ from: serviceFrom }),
}));
vi.mock("@/lib/telegram", () => ({
  sendTelegramMessage: (...args: unknown[]) => sendTelegramMessage(...args),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Map<string, string>(),
}));

import { placeOrder } from "./actions";

beforeEach(() => {
  boothQueue = [];
  vendorTelegramQueue = [];
  orderQueue = [];
  serviceFrom.mockClear();
  sendTelegramMessage.mockClear();
});

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

  it("passes a supplied customer phone through to place_order", async () => {
    let placeOrderArgs: Record<string, unknown> | undefined;
    rpc.mockImplementation((name: string, args?: Record<string, unknown>) => {
      if (name === "check_rate_limit") return Promise.resolve({ data: true });
      if (name === "place_order") {
        placeOrderArgs = args;
        return Promise.resolve({
          data: { order_number: "0007", booth_id: "b1", access_token: "tok7" },
          error: null,
        });
      }
      throw new Error(`unexpected rpc: ${name}`);
    });

    await placeOrder(
      "code123",
      { ...validInput, customerPhone: "+6591234567" },
      IDEM,
    );
    expect(placeOrderArgs).toMatchObject({ p_customer_phone: "+6591234567" });
  });

  it.each([[undefined], [""], ["   "]])(
    "sends an undefined p_customer_phone when omitted or blank (%j)",
    async (customerPhone) => {
      let placeOrderArgs: Record<string, unknown> | undefined;
      rpc.mockImplementation((name: string, args?: Record<string, unknown>) => {
        if (name === "check_rate_limit") return Promise.resolve({ data: true });
        if (name === "place_order") {
          placeOrderArgs = args;
          return Promise.resolve({
            data: {
              order_number: "0007",
              booth_id: "b1",
              access_token: "tok7",
            },
            error: null,
          });
        }
        throw new Error(`unexpected rpc: ${name}`);
      });

      await placeOrder("code123", { ...validInput, customerPhone }, IDEM);
      expect(placeOrderArgs?.p_customer_phone).toBeUndefined();
    },
  );

  describe("Telegram alert (redundant channel — must never affect the result)", () => {
    function mockSuccessfulRpc() {
      rpc.mockImplementation((name: string) => {
        if (name === "check_rate_limit") return Promise.resolve({ data: true });
        if (name === "place_order")
          return Promise.resolve({
            data: {
              order_number: "0007",
              booth_id: "booth-1",
              access_token: "tok7",
            },
            error: null,
          });
        throw new Error(`unexpected rpc: ${name}`);
      });
    }

    it("sends a Telegram alert when the booth's vendor has a linked chat_id", async () => {
      mockSuccessfulRpc();
      boothQueue = [{ data: { vendor_id: "vendor-1" } }];
      vendorTelegramQueue = [{ data: { chat_id: 555 } }];
      orderQueue = [{ data: { total_cents: 700 } }];

      const res = await placeOrder("code123", validInput, IDEM);

      expect(res).toEqual({
        success: true,
        orderNumber: "0007",
        boothId: "booth-1",
        accessToken: "tok7",
      });
      expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
      const [chatId, text] = sendTelegramMessage.mock.calls[0];
      expect(chatId).toBe(555);
      expect(text).toContain("0007");
    });

    it("skips silently when the booth's vendor has no Telegram link", async () => {
      mockSuccessfulRpc();
      boothQueue = [{ data: { vendor_id: "vendor-1" } }];
      vendorTelegramQueue = [{ data: null }];

      const res = await placeOrder("code123", validInput, IDEM);

      expect(res.success).toBe(true);
      expect(sendTelegramMessage).not.toHaveBeenCalled();
    });

    it("a sendTelegramMessage rejection doesn't change placeOrder's own result", async () => {
      mockSuccessfulRpc();
      boothQueue = [{ data: { vendor_id: "vendor-1" } }];
      vendorTelegramQueue = [{ data: { chat_id: 555 } }];
      orderQueue = [{ data: { total_cents: 700 } }];
      sendTelegramMessage.mockRejectedValueOnce(new Error("network down"));

      const res = await placeOrder("code123", validInput, IDEM);

      expect(res).toEqual({
        success: true,
        orderNumber: "0007",
        boothId: "booth-1",
        accessToken: "tok7",
      });
    });
  });
});
