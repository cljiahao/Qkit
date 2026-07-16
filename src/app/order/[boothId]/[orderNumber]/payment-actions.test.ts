import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  claimPayment,
  unclaimPayment,
  getPaymentStatus,
} from "./payment-actions";

// Mock the service client. Two chains hang off from("orders"):
//   write:   update().eq().eq().eq().eq().neq().select("id") → { data, error }
//            (four eq: booth_id, order_number, access_token, payment_status)
//   re-read: select().eq().eq().eq().maybeSingle() → { data }
// `writeSelect` is the write terminal (rows updated); `reread` the re-read
// terminal, used only when the write matched 0 rows.
const {
  createServiceClientMock,
  update,
  writeSelect,
  reread,
  rateLimitMock,
  clientIpMock,
} = vi.hoisted(() => {
  const writeSelect = vi.fn();
  const reread = vi.fn();
  const update = vi.fn(() => ({
    eq: () => ({
      eq: () => ({
        eq: () => ({ eq: () => ({ neq: () => ({ select: writeSelect }) }) }),
      }),
    }),
  }));
  const select = () => ({
    eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: reread }) }) }),
  });
  return {
    createServiceClientMock: vi.fn(() =>
      Promise.resolve({ from: () => ({ update, select }) }),
    ),
    update,
    writeSelect,
    reread,
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

const BOOTH = "00000000-0000-4000-8000-000000000001";
const ORDER = "A17";
const TOKEN = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  createServiceClientMock.mockClear();
  update.mockClear();
  // Default: the guarded UPDATE matched its row.
  writeSelect
    .mockReset()
    .mockResolvedValue({ data: [{ id: "o1" }], error: null });
  reread.mockReset().mockResolvedValue({ data: null });
  rateLimitMock.mockReset().mockResolvedValue(true);
  clientIpMock.mockClear();
});

describe("claimPayment", () => {
  it("claims a valid pending order (update runs, returns success)", async () => {
    const res = await claimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({ payment_status: "claimed" });
  });

  it("blocks when rate-limited and does not touch the DB", async () => {
    rateLimitMock.mockResolvedValue(false);
    const res = await claimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Too many attempts — wait a moment.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an invalid booth id before creating the client", async () => {
    const res = await claimPayment("not-a-uuid", ORDER, TOKEN);
    expect(res).toEqual({ success: false, error: "Invalid booth" });
    expect(createServiceClientMock).not.toHaveBeenCalled();
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an empty order number before creating the client", async () => {
    const res = await claimPayment(BOOTH, "", TOKEN);
    expect(res).toEqual({ success: false, error: "Invalid order" });
    expect(createServiceClientMock).not.toHaveBeenCalled();
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a missing/invalid token before creating the client", async () => {
    const res = await claimPayment(BOOTH, ORDER, "not-a-uuid");
    expect(res).toEqual({ success: false, error: "Invalid order" });
    expect(createServiceClientMock).not.toHaveBeenCalled();
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a failure when the update errors", async () => {
    writeSelect.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await claimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Could not record payment. Try again.",
    });
  });

  it("rejects a claim on a cancelled order (0 rows, re-read cancelled)", async () => {
    writeSelect.mockResolvedValue({ data: [], error: null });
    reread.mockResolvedValue({
      data: { payment_status: "pending", status: "cancelled" },
    });
    const res = await claimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "This order was cancelled.",
    });
  });

  it("stays idempotent on a double-tap (0 rows, already claimed)", async () => {
    writeSelect.mockResolvedValue({ data: [], error: null });
    reread.mockResolvedValue({
      data: { payment_status: "claimed", status: "preparing" },
    });
    const res = await claimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
  });
});

describe("unclaimPayment", () => {
  it("reverts a claimed order back to pending", async () => {
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({ payment_status: "pending" });
  });

  it("blocks when rate-limited and does not touch the DB", async () => {
    rateLimitMock.mockResolvedValue(false);
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Too many attempts — wait a moment.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an invalid booth id before creating the client", async () => {
    const res = await unclaimPayment("not-a-uuid", ORDER, TOKEN);
    expect(res).toEqual({ success: false, error: "Invalid booth" });
    expect(createServiceClientMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("stays idempotent when already back to pending (0 rows)", async () => {
    writeSelect.mockResolvedValue({ data: [], error: null });
    reread.mockResolvedValue({ data: { payment_status: "pending" } });
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
  });

  it("refuses to undo a payment the vendor already confirmed", async () => {
    writeSelect.mockResolvedValue({ data: [], error: null });
    reread.mockResolvedValue({ data: { payment_status: "confirmed" } });
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "The stall already confirmed your payment.",
    });
  });
});

describe("getPaymentStatus", () => {
  it("returns null for an invalid token without creating a client", async () => {
    const res = await getPaymentStatus(BOOTH, ORDER, "not-a-uuid");
    expect(res).toBeNull();
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("returns null when the token doesn't match any order", async () => {
    reread.mockResolvedValue({ data: null });
    const res = await getPaymentStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
  });

  it("returns the payment status for a matching token", async () => {
    reread.mockResolvedValue({ data: { payment_status: "confirmed" } });
    const res = await getPaymentStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBe("confirmed");
  });

  it("returns null and logs on a real read error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    reread.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await getPaymentStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith("getPaymentStatus failed", "boom");
    errorSpy.mockRestore();
  });
});
