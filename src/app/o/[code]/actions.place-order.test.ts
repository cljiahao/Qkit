import { describe, it, expect, vi, beforeEach } from "vitest";

// place_order is reached only after the anti-flood check; stub both RPCs so
// execution flows exactly to the reject/success point under test.
const rpc = vi.fn();

// Service-role lookups for the post-order vendor alert: booths -> vendor_id,
// orders -> total_cents. Each test configures the queues it needs; defaults
// resolve to "not found" so tests that don't care about the alert at all
// (the pre-existing ones above) just no-op through it.
let boothQueue: { data: unknown }[] = [];
let orderQueue: { data: unknown }[] = [];
const orderUpdateMock = vi
  .fn()
  .mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
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
      update: orderUpdateMock,
    };
  }
  throw new Error(`unexpected table: ${table}`);
});

const notifyVendor = vi.fn().mockResolvedValue(undefined);
const createPrintJob = vi
  .fn()
  .mockResolvedValue({ ok: true, data: { id: "job-1" } });

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ rpc }),
  createServiceClient: async () => ({ from: serviceFrom }),
}));
vi.mock("@/lib/merqo-customer-notify", () => ({
  notifyVendor: (...args: unknown[]) => notifyVendor(...args),
}));
vi.mock("@/lib/printkit/client", () => ({
  createPrintJob: (...args: unknown[]) => createPrintJob(...args),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Map<string, string>(),
}));

import { placeOrder } from "./actions";

beforeEach(() => {
  boothQueue = [];
  orderQueue = [];
  serviceFrom.mockClear();
  notifyVendor.mockClear();
  createPrintJob.mockClear();
  orderUpdateMock.mockClear();
});

const validInput = {
  customerName: "Ada",
  items: [{ menuItemId: "m1", name: "Kopi", price_cents: 200, quantity: 1 }],
};
const IDEM = "11111111-1111-1111-1111-111111111111";

// Shared by the vendor-alert and printkit-notify describe blocks below —
// both exercise a redundant post-order notify channel off the same
// successful place_order RPC response.
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

  describe("vendor alert (redundant channel — must never affect the result)", () => {
    it("calls notifyVendor with the booth's vendor_id and a message containing the order number/total", async () => {
      mockSuccessfulRpc();
      boothQueue = [{ data: { vendor_id: "vendor-1" } }];
      orderQueue = [{ data: { total_cents: 700 } }];

      const res = await placeOrder("code123", validInput, IDEM);

      expect(res).toEqual({
        success: true,
        orderNumber: "0007",
        boothId: "booth-1",
        accessToken: "tok7",
      });
      expect(notifyVendor).toHaveBeenCalledTimes(1);
      const [vendorId, message] = notifyVendor.mock.calls[0];
      expect(vendorId).toBe("vendor-1");
      expect(message).toContain("0007");
      expect(message).toContain("7.00");
    });

    it("skips silently when the booth can't be resolved", async () => {
      mockSuccessfulRpc();
      boothQueue = [{ data: null }];

      const res = await placeOrder("code123", validInput, IDEM);

      expect(res.success).toBe(true);
      expect(notifyVendor).not.toHaveBeenCalled();
    });

    it("a notifyVendor failure doesn't change placeOrder's own result", async () => {
      mockSuccessfulRpc();
      boothQueue = [{ data: { vendor_id: "vendor-1" } }];
      orderQueue = [{ data: { total_cents: 700 } }];
      notifyVendor.mockRejectedValueOnce(new Error("network down"));

      const res = await placeOrder("code123", validInput, IDEM);

      expect(res).toEqual({
        success: true,
        orderNumber: "0007",
        boothId: "booth-1",
        accessToken: "tok7",
      });
    });
  });

  describe("printkit notify (redundant channel — must never affect the result)", () => {
    it("calls createPrintJob with the booth's vendor_id, order id, order number, and customer name", async () => {
      mockSuccessfulRpc();
      boothQueue = [
        { data: { vendor_id: "vendor-1" } }, // consumed by notifyVendorTelegram
        { data: { vendor_id: "vendor-1" } }, // consumed by notifyPrintkit
      ];
      orderQueue = [
        { data: { total_cents: 700 } }, // consumed by notifyVendorTelegram
        { data: { id: "order-uuid-1" } }, // consumed by notifyPrintkit
      ];

      const res = await placeOrder("code123", validInput, IDEM);

      expect(res.success).toBe(true);
      expect(createPrintJob).toHaveBeenCalledTimes(1);
      expect(createPrintJob).toHaveBeenCalledWith({
        vendorId: "vendor-1",
        orderId: "order-uuid-1",
        customerName: validInput.customerName,
        orderNumber: "0007",
      });
    });

    it("marks the order's print_status 'queued' when createPrintJob succeeds", async () => {
      mockSuccessfulRpc();
      boothQueue = [
        { data: { vendor_id: "vendor-1" } },
        { data: { vendor_id: "vendor-1" } },
      ];
      orderQueue = [
        { data: { total_cents: 700 } },
        { data: { id: "order-uuid-1" } },
      ];

      const res = await placeOrder("code123", validInput, IDEM);

      expect(res.success).toBe(true);
      expect(orderUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ print_status: "queued" }),
      );
    });

    it("does not touch print_status when createPrintJob fails", async () => {
      mockSuccessfulRpc();
      boothQueue = [
        { data: { vendor_id: "vendor-1" } },
        { data: { vendor_id: "vendor-1" } },
      ];
      orderQueue = [
        { data: { total_cents: 700 } },
        { data: { id: "order-uuid-1" } },
      ];
      createPrintJob.mockResolvedValueOnce({
        ok: false,
        status: 503,
        error: "printkit down",
      });

      const res = await placeOrder("code123", validInput, IDEM);

      expect(res.success).toBe(true);
      expect(orderUpdateMock).not.toHaveBeenCalled();
    });

    it("skips silently when the order id can't be resolved", async () => {
      mockSuccessfulRpc();
      boothQueue = [
        { data: { vendor_id: "vendor-1" } },
        { data: { vendor_id: "vendor-1" } },
      ];
      orderQueue = [{ data: { total_cents: 700 } }, { data: null }];

      const res = await placeOrder("code123", validInput, IDEM);

      expect(res.success).toBe(true);
      expect(createPrintJob).not.toHaveBeenCalled();
    });

    it("a createPrintJob failure doesn't change placeOrder's own result", async () => {
      mockSuccessfulRpc();
      boothQueue = [
        { data: { vendor_id: "vendor-1" } },
        { data: { vendor_id: "vendor-1" } },
      ];
      orderQueue = [
        { data: { total_cents: 700 } },
        { data: { id: "order-uuid-1" } },
      ];
      createPrintJob.mockRejectedValueOnce(new Error("printkit down"));

      const res = await placeOrder("code123", validInput, IDEM);

      expect(res.success).toBe(true);
    });
  });
});
