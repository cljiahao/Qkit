import { describe, expect, it, vi, beforeEach } from "vitest";
import { claimPayment, getPaymentStatus } from "./payment-actions";

// Mock the service client. Two tables are queried:
//   orders:  select().eq().eq().eq().maybeSingle() (loadCheckoutContext read,
//            and getPaymentStatus's own read — same chain shape, different
//            column list, which the mock doesn't care about)
//            update().eq().eq().eq().eq().neq().select("id") (the local
//            payment_status mirror write claimPayment does after a
//            successful paykit claim)
//   booths:  select().eq().maybeSingle() (loadCheckoutContext's vendor_id read)
const {
  createServiceClientMock,
  ordersMaybeSingle,
  boothsMaybeSingle,
  update,
  writeSelect,
  rateLimitMock,
  clientIpMock,
} = vi.hoisted(() => {
  const ordersMaybeSingle = vi.fn();
  const boothsMaybeSingle = vi.fn();
  const writeSelect = vi.fn();
  const update = vi.fn(() => ({
    eq: () => ({
      eq: () => ({
        eq: () => ({ eq: () => ({ neq: () => ({ select: writeSelect }) }) }),
      }),
    }),
  }));
  const ordersSelect = () => ({
    eq: () => ({
      eq: () => ({ eq: () => ({ maybeSingle: ordersMaybeSingle }) }),
    }),
  });
  const boothsSelect = () => ({
    eq: () => ({ maybeSingle: boothsMaybeSingle }),
  });
  const from = (table: string) =>
    table === "booths"
      ? { select: boothsSelect }
      : { select: ordersSelect, update };
  return {
    createServiceClientMock: vi.fn(() => Promise.resolve({ from })),
    ordersMaybeSingle,
    boothsMaybeSingle,
    update,
    writeSelect,
    rateLimitMock: vi.fn(),
    clientIpMock: vi.fn(() => "1.2.3.4"),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: rateLimitMock,
  clientIp: clientIpMock,
}));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve({}) }));

const { createCheckoutMock, claimCheckoutMock } = vi.hoisted(() => ({
  createCheckoutMock: vi.fn(),
  claimCheckoutMock: vi.fn(),
}));
vi.mock("@/lib/paykit/client", () => ({
  createCheckout: createCheckoutMock,
  claimCheckout: claimCheckoutMock,
}));

const BOOTH = "00000000-0000-4000-8000-000000000001";
const ORDER = "A17";
const TOKEN = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  createServiceClientMock.mockClear();
  update.mockClear();
  ordersMaybeSingle.mockReset().mockResolvedValue({
    data: {
      id: "o1",
      total_cents: 800,
      payment_status: "pending",
      status: "preparing",
    },
  });
  boothsMaybeSingle
    .mockReset()
    .mockResolvedValue({ data: { vendor_id: "v1" } });
  // Default: the guarded mirror UPDATE matched its row.
  writeSelect
    .mockReset()
    .mockResolvedValue({ data: [{ id: "o1" }], error: null });
  rateLimitMock.mockReset().mockResolvedValue(true);
  clientIpMock.mockClear();
  createCheckoutMock.mockReset().mockResolvedValue({
    ok: true,
    data: { type: "qr", transactionId: "tx1", payload: "0002" },
  });
  claimCheckoutMock.mockReset().mockResolvedValue({
    ok: true,
    data: {
      transactionId: "tx1",
      status: "claimed",
      amountCents: 800,
      orderRef: "o1",
      claimedAt: "2026-08-11T00:00:00Z",
      confirmedAt: null,
    },
  });
});

describe("claimPayment", () => {
  it("claims a valid pending order via paykit and mirrors the status locally", async () => {
    const res = await claimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
    expect(createCheckoutMock).toHaveBeenCalledWith({
      vendorId: "v1",
      amountCents: 800,
      orderRef: "o1",
    });
    expect(claimCheckoutMock).toHaveBeenCalledWith("tx1");
    expect(update).toHaveBeenCalledWith({ payment_status: "claimed" });
  });

  it("blocks when rate-limited and never calls paykit", async () => {
    rateLimitMock.mockResolvedValue(false);
    const res = await claimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Too many attempts — wait a moment.",
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid booth id before creating the client", async () => {
    const res = await claimPayment("not-a-uuid", ORDER, TOKEN);
    expect(res).toEqual({ success: false, error: "Invalid booth" });
    expect(createServiceClientMock).not.toHaveBeenCalled();
    expect(rateLimitMock).not.toHaveBeenCalled();
  });

  it("rejects an empty order number before creating the client", async () => {
    const res = await claimPayment(BOOTH, "", TOKEN);
    expect(res).toEqual({ success: false, error: "Invalid order" });
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("rejects a missing/invalid token before creating the client", async () => {
    const res = await claimPayment(BOOTH, ORDER, "not-a-uuid");
    expect(res).toEqual({ success: false, error: "Invalid order" });
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("returns 'Invalid order' when the order/booth lookup finds nothing", async () => {
    ordersMaybeSingle.mockResolvedValue({ data: null });
    const res = await claimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: false, error: "Invalid order" });
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("rejects a claim on a cancelled order without calling paykit", async () => {
    ordersMaybeSingle.mockResolvedValue({
      data: {
        id: "o1",
        total_cents: 800,
        payment_status: "pending",
        status: "cancelled",
      },
    });
    const res = await claimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "This order was cancelled.",
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("stays idempotent on a double-tap (already claimed) without re-calling paykit", async () => {
    ordersMaybeSingle.mockResolvedValue({
      data: {
        id: "o1",
        total_cents: 800,
        payment_status: "claimed",
        status: "preparing",
      },
    });
    const res = await claimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("stays idempotent once the vendor already confirmed", async () => {
    ordersMaybeSingle.mockResolvedValue({
      data: {
        id: "o1",
        total_cents: 800,
        payment_status: "confirmed",
        status: "preparing",
      },
    });
    const res = await claimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("rejects an order that never required payment", async () => {
    ordersMaybeSingle.mockResolvedValue({
      data: {
        id: "o1",
        total_cents: 800,
        payment_status: "not_required",
        status: "preparing",
      },
    });
    const res = await claimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "This order doesn't take payment.",
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("reports a failure when paykit checkout creation fails", async () => {
    createCheckoutMock.mockResolvedValue({
      ok: false,
      status: 503,
      error: "Upstream unavailable",
    });
    const res = await claimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Could not record payment. Try again.",
    });
    expect(claimCheckoutMock).not.toHaveBeenCalled();
  });

  it("reports a failure when paykit's claim call fails", async () => {
    claimCheckoutMock.mockResolvedValue({
      ok: false,
      status: 503,
      error: "Upstream unavailable",
    });
    const res = await claimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Could not record payment. Try again.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("still reports success when the local mirror write fails (paykit already recorded the claim)", async () => {
    writeSelect.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await claimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
  });
});

describe("getPaymentStatus", () => {
  it("returns null for an invalid token without creating a client", async () => {
    const res = await getPaymentStatus(BOOTH, ORDER, "not-a-uuid");
    expect(res).toBeNull();
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("returns null when the token doesn't match any order", async () => {
    ordersMaybeSingle.mockResolvedValue({ data: null });
    const res = await getPaymentStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
  });

  it("returns the payment status for a matching token", async () => {
    ordersMaybeSingle.mockResolvedValue({
      data: { payment_status: "confirmed" },
    });
    const res = await getPaymentStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBe("confirmed");
  });

  it("returns null and logs on a real read error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    ordersMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const res = await getPaymentStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith("getPaymentStatus failed", "boom");
    errorSpy.mockRestore();
  });
});
