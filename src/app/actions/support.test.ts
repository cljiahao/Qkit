import { describe, it, expect, vi, beforeEach } from "vitest";

// submitSupportMessage inserts into `support_messages` via the normal client
// after resolving the signed-in vendor. Drive getUser + capture the insert.
const insert = vi.fn(() =>
  Promise.resolve({ error: null as null | { message: string } }),
);
const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: { getUser },
    from: () => ({ insert }),
  }),
}));

import { submitSupportMessage } from "./support";

const VENDOR = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  insert.mockClear().mockResolvedValue({ error: null });
  getUser.mockReset().mockResolvedValue({ data: { user: { id: VENDOR } } });
});

describe("submitSupportMessage", () => {
  it("inserts the message keyed to the signed-in vendor", async () => {
    const res = await submitSupportMessage({
      category: "payment",
      body: "PayNow didn't go through",
    });
    expect(res).toEqual({ success: true });
    expect(insert).toHaveBeenCalledWith({
      vendor_id: VENDOR,
      category: "payment",
      body: "PayNow didn't go through",
    });
  });

  it("rejects an empty body before touching the DB", async () => {
    const res = await submitSupportMessage({ category: "pass", body: "   " });
    expect(res.success).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a bad category", async () => {
    const res = await submitSupportMessage({
      // @ts-expect-error — exercising the runtime guard
      category: "refund",
      body: "hi",
    });
    expect(res.success).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("asks the user to sign in when there's no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await submitSupportMessage({ category: "other", body: "hey" });
    expect(res).toEqual({ success: false, error: "Please sign in first" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("surfaces a DB failure without throwing", async () => {
    insert.mockResolvedValue({ error: { message: "boom" } });
    const res = await submitSupportMessage({ category: "pro", body: "help" });
    expect(res).toEqual({
      success: false,
      error: "Could not send your message",
    });
  });
});
