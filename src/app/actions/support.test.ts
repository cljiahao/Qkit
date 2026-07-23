import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUserMock, rpcMock, schemaMock, createServerClientMock } = vi.hoisted(
  () => ({
    getUserMock: vi.fn(),
    rpcMock: vi.fn(),
    schemaMock: vi.fn(),
    createServerClientMock: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: createServerClientMock,
}));

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: "v1" } } });
  rpcMock.mockReset().mockResolvedValue({ data: { id: "msg1" }, error: null });
  schemaMock.mockReset().mockReturnValue({ rpc: rpcMock });
  createServerClientMock.mockReset().mockResolvedValue({
    auth: { getUser: getUserMock },
    schema: schemaMock,
  });
});

describe("submitSupportMessage", () => {
  it("calls the RPC with the signed-in vendor's category and body", async () => {
    const { submitSupportMessage } = await import("./support");
    const result = await submitSupportMessage({
      category: "payment",
      body: "PayNow didn't go through",
    });
    expect(result).toEqual({ success: true });
    expect(rpcMock).toHaveBeenCalledWith("submit_support_message", {
      p_kit_slug: "qkit",
      p_category: "payment",
      p_body: "PayNow didn't go through",
    });
  });

  it("rejects an empty body before calling the RPC", async () => {
    const { submitSupportMessage } = await import("./support");
    const result = await submitSupportMessage({
      category: "pass",
      body: "   ",
    });
    expect(result.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a bad category", async () => {
    const { submitSupportMessage } = await import("./support");
    const result = await submitSupportMessage({
      // @ts-expect-error — exercising the runtime guard
      category: "refund",
      body: "hi",
    });
    expect(result.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("asks the user to sign in when there's no session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { submitSupportMessage } = await import("./support");
    const result = await submitSupportMessage({
      category: "other",
      body: "hey",
    });
    expect(result).toEqual({ success: false, error: "Please sign in first" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("surfaces a friendly error when the RPC fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { submitSupportMessage } = await import("./support");
    const result = await submitSupportMessage({
      category: "pro",
      body: "help",
    });
    expect(result).toEqual({
      success: false,
      error: "Could not send your message",
    });
  });
});
