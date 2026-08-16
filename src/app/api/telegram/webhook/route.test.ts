import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendTelegramMessage = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/telegram", () => ({
  sendTelegramMessage: (...args: unknown[]) => sendTelegramMessage(...args),
}));

// Chainable Supabase query-builder mock: every method returns `this` except
// the terminal ones (maybeSingle/then-able eq-after-delete), which resolve
// to the queued result. Each test configures `queue` with one entry per
// expected call, in call order.
type QueryResult = { data: unknown; error: unknown };
let maybeSingleQueue: QueryResult[] = [];
const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
const deleteEq = vi.fn().mockResolvedValue({ data: null, error: null });
const from = vi.fn((table: string) => {
  if (table === "telegram_link_tokens") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve(
              maybeSingleQueue.shift() ?? { data: null, error: null },
            ),
        }),
      }),
      delete: () => ({ eq: deleteEq }),
    };
  }
  if (table === "vendor_telegram") {
    return { upsert };
  }
  throw new Error(`unexpected table: ${table}`);
});
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({ from }),
}));

import { POST } from "./route";

const SECRET = "webhook-secret-xyz";
const ORIGINAL_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {
    "x-telegram-bot-api-secret-token": SECRET,
  },
): Request {
  return new Request("https://qkit.example.com/api/telegram/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  maybeSingleQueue = [];
  upsert.mockClear();
  deleteEq.mockClear();
  from.mockClear();
  sendTelegramMessage.mockClear();
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
  else process.env.TELEGRAM_WEBHOOK_SECRET = ORIGINAL_SECRET;
});

describe("POST /api/telegram/webhook", () => {
  it("401s when the secret-token header is missing", async () => {
    const res = await POST(makeRequest({}, {}));
    expect(res.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("401s when the secret-token header is wrong", async () => {
    const res = await POST(
      makeRequest({}, { "x-telegram-bot-api-secret-token": "wrong" }),
    );
    expect(res.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("401s when TELEGRAM_WEBHOOK_SECRET is unset server-side (fails closed)", async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("upserts vendor_telegram and deletes the token on a valid /start", async () => {
    maybeSingleQueue = [
      {
        data: {
          vendor_id: "vendor-1",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
        error: null,
      },
    ];
    const res = await POST(
      makeRequest({
        message: { text: "/start abc123", chat: { id: 999 } },
      }),
    );
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({
      vendor_id: "vendor-1",
      chat_id: 999,
    });
    expect(deleteEq).toHaveBeenCalledWith("token", "abc123");
    expect(sendTelegramMessage).toHaveBeenCalledWith(999, expect.any(String));
  });

  it("writes nothing for an expired token, still responds 200", async () => {
    maybeSingleQueue = [
      {
        data: {
          vendor_id: "vendor-1",
          expires_at: new Date(Date.now() - 60_000).toISOString(),
        },
        error: null,
      },
    ];
    const res = await POST(
      makeRequest({
        message: { text: "/start expired-token", chat: { id: 999 } },
      }),
    );
    expect(res.status).toBe(200);
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteEq).not.toHaveBeenCalled();
  });

  it("writes nothing for an unknown token, still responds 200", async () => {
    maybeSingleQueue = [{ data: null, error: null }];
    const res = await POST(
      makeRequest({
        message: { text: "/start no-such-token", chat: { id: 999 } },
      }),
    );
    expect(res.status).toBe(200);
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteEq).not.toHaveBeenCalled();
  });

  it("always responds 200 to a Telegram-shaped payload that isn't a /start", async () => {
    const res = await POST(
      makeRequest({ message: { text: "hello", chat: { id: 1 } } }),
    );
    expect(res.status).toBe(200);
    expect(from).not.toHaveBeenCalled();
  });

  it("responds 200 (not 500) even when the internal lookup throws", async () => {
    maybeSingleQueue = [];
    from.mockImplementationOnce(() => {
      throw new Error("db unreachable");
    });
    const res = await POST(
      makeRequest({
        message: { text: "/start abc123", chat: { id: 999 } },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("responds 200 (not 500) on a malformed JSON body", async () => {
    const req = new Request("https://qkit.example.com/api/telegram/webhook", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": SECRET },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
