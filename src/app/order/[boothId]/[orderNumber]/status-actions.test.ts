import { describe, expect, it, vi, beforeEach } from "vitest";
import { getOrderStatus } from "./status-actions";

const { createServiceClientMock, maybeSingle } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  return {
    createServiceClientMock: vi.fn(() =>
      Promise.resolve({
        from: () => ({
          select: () => ({
            eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }),
          }),
        }),
      }),
    ),
    maybeSingle,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));

const BOOTH = "00000000-0000-4000-8000-000000000001";
const ORDER = "A17";
const TOKEN = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  createServiceClientMock.mockClear();
  maybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
});

describe("getOrderStatus", () => {
  it("returns null for an invalid token without creating a client", async () => {
    const res = await getOrderStatus(BOOTH, ORDER, "not-a-uuid");
    expect(res).toBeNull();
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("returns null when the token doesn't match any order", async () => {
    const res = await getOrderStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
  });

  it("returns the status for a matching token", async () => {
    maybeSingle.mockResolvedValue({ data: { status: "ready" }, error: null });
    const res = await getOrderStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBe("ready");
  });

  it("returns null and logs on a real read error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await getOrderStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith("getOrderStatus failed", "boom");
    errorSpy.mockRestore();
  });
});
