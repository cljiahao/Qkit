import { describe, it, expect, vi, beforeEach } from "vitest";

let existingRow: { id: string } | null = null;
let getUserResult: { data: { user: { id: string } | null } } = {
  data: { user: { id: "vendor-1" } },
};
const { insert, rateLimitMock } = vi.hoisted(() => ({
  insert: vi.fn(
    (): Promise<{ error: { message: string } | null }> =>
      Promise.resolve({ error: null }),
  ),
  rateLimitMock: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit: rateLimitMock }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: { getUser: () => Promise.resolve(getUserResult) },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: existingRow }),
              }),
            }),
          }),
        }),
      }),
      insert,
    }),
  }),
}));

import { requestUpgrade } from "./purchase";

beforeEach(() => {
  insert.mockClear();
  rateLimitMock.mockReset().mockResolvedValue(true);
  existingRow = null;
  getUserResult = { data: { user: { id: "vendor-1" } } };
});

describe("requestUpgrade", () => {
  it("rejects an invalid option without touching the database", async () => {
    // @ts-expect-error — exercising the runtime guard with a bad value
    const result = await requestUpgrade("annual");
    expect(result).toEqual({ success: false, error: "Invalid option" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("requires a signed-in vendor", async () => {
    getUserResult = { data: { user: null } };
    const result = await requestUpgrade("event");
    expect(result).toEqual({ success: false, error: "Please sign in first" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("is rate-limited per vendor before the idempotency check", async () => {
    rateLimitMock.mockResolvedValue(false);
    const result = await requestUpgrade("event");
    expect(result).toEqual({
      success: false,
      error: "Too many requests. Wait a moment.",
    });
    expect(insert).not.toHaveBeenCalled();
    expect(rateLimitMock).toHaveBeenCalledWith(
      expect.anything(),
      "upgrade-request:vendor-1",
      5,
      60,
    );
  });

  it("is a no-op success when a pending request of the same kind already exists", async () => {
    existingRow = { id: "req-1" };
    const result = await requestUpgrade("monthly");
    expect(result).toEqual({ success: true });
    expect(insert).not.toHaveBeenCalled();
  });

  it("inserts a new request and reports success", async () => {
    const result = await requestUpgrade("event");
    expect(result).toEqual({ success: true });
    expect(insert).toHaveBeenCalledWith({
      vendor_id: "vendor-1",
      kind: "event",
    });
  });

  it("reports failure when the insert errors", async () => {
    insert.mockReturnValueOnce(Promise.resolve({ error: { message: "boom" } }));
    const result = await requestUpgrade("event");
    expect(result).toEqual({
      success: false,
      error: "Could not send your request",
    });
  });
});
