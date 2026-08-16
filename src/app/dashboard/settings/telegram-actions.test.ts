import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { getUser, insert, deleteEq, generateLinkToken } = vi.hoisted(() => ({
  getUser: vi.fn(),
  insert: vi.fn(),
  deleteEq: vi.fn(),
  generateLinkToken: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => getUser() },
  }),
  createServiceClient: vi.fn().mockResolvedValue({
    from: (table: string) => {
      if (table === "telegram_link_tokens") {
        return { insert: (row: unknown) => insert(row) };
      }
      if (table === "vendor_telegram") {
        return { delete: () => ({ eq: deleteEq }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  }),
}));
vi.mock("@/lib/telegram", () => ({
  generateLinkToken: () => generateLinkToken(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { generateTelegramLink, disconnectTelegram } from "./telegram-actions";

const ORIGINAL_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME;

beforeEach(() => {
  getUser.mockReset();
  insert.mockReset();
  deleteEq.mockReset();
  generateLinkToken.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "vendor-1" } } });
  insert.mockResolvedValue({ error: null });
  deleteEq.mockResolvedValue({ error: null });
  generateLinkToken.mockReturnValue("tok123");
  process.env.TELEGRAM_BOT_USERNAME = "QkitOrdersBot";
});

afterEach(() => {
  if (ORIGINAL_BOT_USERNAME === undefined)
    delete process.env.TELEGRAM_BOT_USERNAME;
  else process.env.TELEGRAM_BOT_USERNAME = ORIGINAL_BOT_USERNAME;
});

describe("generateTelegramLink", () => {
  it("mints a token, inserts it, and returns the t.me deep link", async () => {
    const res = await generateTelegramLink();
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.deepLinkUrl).toBe("https://t.me/QkitOrdersBot?start=tok123");
    }
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ token: "tok123", vendor_id: "vendor-1" }),
    );
  });

  it("returns an error when not signed in, without inserting", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await generateTelegramLink();
    expect(res.success).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns an error when TELEGRAM_BOT_USERNAME is unset, without inserting", async () => {
    delete process.env.TELEGRAM_BOT_USERNAME;
    const res = await generateTelegramLink();
    expect(res.success).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns an error when the insert fails", async () => {
    insert.mockResolvedValue({ error: { message: "boom" } });
    const res = await generateTelegramLink();
    expect(res.success).toBe(false);
  });
});

describe("disconnectTelegram", () => {
  it("deletes the caller's vendor_telegram row", async () => {
    const res = await disconnectTelegram();
    expect(res.success).toBe(true);
    expect(deleteEq).toHaveBeenCalledWith("vendor_id", "vendor-1");
  });

  it("returns an error when not signed in, without deleting", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await disconnectTelegram();
    expect(res.success).toBe(false);
    expect(deleteEq).not.toHaveBeenCalled();
  });

  it("returns an error when the delete fails", async () => {
    deleteEq.mockResolvedValue({ error: { message: "boom" } });
    const res = await disconnectTelegram();
    expect(res.success).toBe(false);
  });
});
