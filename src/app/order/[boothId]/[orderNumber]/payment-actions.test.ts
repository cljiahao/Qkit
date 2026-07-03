import { describe, expect, it, vi, beforeEach } from "vitest";
import { claimPayment } from "./payment-actions";

// Mock the service client's write chain:
//   from("orders").update().eq().eq().eq().eq().neq() → { error }
// (four eq: booth_id, order_number, access_token, payment_status.) `neq` is the
// terminal and is set per-test to a configurable { error }. `update` is a spy so
// we can assert the payload and that it ran at all.
const { createServiceClientMock, update, neq, rateLimitMock, clientIpMock } =
  vi.hoisted(() => {
    const neq = vi.fn();
    const update = vi.fn(() => ({
      eq: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ neq }) }) }) }),
    }));
    return {
      createServiceClientMock: vi.fn(() =>
        Promise.resolve({ from: () => ({ update }) }),
      ),
      update,
      neq,
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
  neq.mockReset().mockResolvedValue({ error: null });
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
    neq.mockResolvedValue({ error: { message: "boom" } });
    const res = await claimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Could not record payment. Try again.",
    });
  });
});
