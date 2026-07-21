import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getOrderStatus,
  getWaitEstimate,
  confirmArrival,
} from "./status-actions";

// Chainable stub: every builder method returns itself; the chain is
// awaitable directly (multi-row reads here never call a terminal
// .maybeSingle()/.single()) and .maybeSingle() also resolves the same
// result for the single-row lookups.
function chain(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.select = self;
  obj.eq = self;
  obj.in = self;
  obj.order = self;
  obj.limit = self;
  obj.maybeSingle = () => Promise.resolve(result);
  obj.then = (resolve: (v: typeof result) => void) =>
    Promise.resolve(result).then(resolve);
  return obj;
}

const { createServiceClientMock, fromMock, rateLimitMockRef } = vi.hoisted(
  () => {
    const fromMock = vi.fn();
    return {
      // Return type widened to `(...args) => any` (rather than the narrower
      // inferred `typeof fromMock`) so confirmArrival's describe block below
      // can swap in a differently-shaped `from` via mockImplementation — it
      // needs an update() chain the read-only chain() helper doesn't support.
      createServiceClientMock: vi.fn(
        (): Promise<{ from: (...args: unknown[]) => unknown }> =>
          Promise.resolve({ from: fromMock }),
      ),
      fromMock,
      rateLimitMockRef: vi.fn(),
    };
  },
);

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));
// confirmArrival is rate-limited like claimPayment (payment-actions.ts) — a
// single shared mock ref since a module path can only be mocked once per file.
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => rateLimitMockRef(...args),
  clientIp: () => "1.2.3.4",
}));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve({}) }));

const BOOTH = "00000000-0000-4000-8000-000000000001";
const ORDER = "A17";
const TOKEN = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  createServiceClientMock.mockClear();
  fromMock.mockReset().mockReturnValue(chain({ data: null, error: null }));
  rateLimitMockRef.mockReset().mockResolvedValue(true);
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
    fromMock.mockReturnValue(chain({ data: { status: "ready" }, error: null }));
    const res = await getOrderStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBe("ready");
  });

  it("returns null and logs on a real read error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fromMock.mockReturnValue(chain({ data: null, error: { message: "boom" } }));
    const res = await getOrderStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith("getOrderStatus failed", "boom");
    errorSpy.mockRestore();
  });
});

describe("getWaitEstimate", () => {
  it("returns null for an invalid token without creating a client", async () => {
    const res = await getWaitEstimate(BOOTH, ORDER, "not-a-uuid");
    expect(res).toBeNull();
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("returns null when the token doesn't match any order", async () => {
    const res = await getWaitEstimate(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
  });

  it("computes an estimate from active orders ahead and recent wait history", async () => {
    const target = {
      id: "t",
      status: "pending",
      created_at: "2026-06-12T10:05:00Z",
      priority_bumped_at: null,
    };
    const active = [
      target,
      {
        id: "a",
        status: "preparing",
        created_at: "2026-06-12T10:00:00Z",
        priority_bumped_at: null,
      },
    ];
    const recent = Array.from({ length: 10 }, () => ({
      status: "completed",
      created_at: "2026-06-12T04:00:00Z",
      ready_at: "2026-06-12T04:02:00Z", // 120s wait each
      total_cents: 0,
      items: [],
    }));
    fromMock
      .mockReturnValueOnce(chain({ data: target, error: null }))
      .mockReturnValueOnce(chain({ data: active, error: null }))
      .mockReturnValueOnce(chain({ data: recent, error: null }));

    const res = await getWaitEstimate(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ seconds: 120, ordersAhead: 1 }); // 1 ahead * 120s avg
  });

  it("returns ordersAhead but a null seconds estimate below the minimum recent-order sample size", async () => {
    const target = {
      id: "t",
      status: "pending",
      created_at: "2026-06-12T10:05:00Z",
      priority_bumped_at: null,
    };
    const active = [
      target,
      {
        id: "a",
        status: "preparing",
        created_at: "2026-06-12T10:00:00Z",
        priority_bumped_at: null,
      },
    ];
    fromMock
      .mockReturnValueOnce(chain({ data: target, error: null }))
      .mockReturnValueOnce(chain({ data: active, error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }));

    const res = await getWaitEstimate(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ seconds: null, ordersAhead: 1 });
  });

  it("falls back to the vendor's default_prep_minutes below the sample size", async () => {
    const target = {
      id: "t",
      status: "pending",
      created_at: "2026-06-12T10:05:00Z",
      priority_bumped_at: null,
    };
    const active = [
      target,
      {
        id: "a",
        status: "preparing",
        created_at: "2026-06-12T10:00:00Z",
        priority_bumped_at: null,
      },
    ];
    fromMock
      .mockReturnValueOnce(chain({ data: target, error: null }))
      .mockReturnValueOnce(chain({ data: active, error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: { vendor_id: "v1" }, error: null }))
      .mockReturnValueOnce(
        chain({
          data: {
            board_settings: {
              aging_min: 5,
              overdue_min: 10,
              sound_id: "chime",
              desktop_notify: false,
              undo_seconds: 4,
              daily_order_number_reset: false,
              default_prep_minutes: 8,
              ready_auto_clear_min: 3,
            },
          },
          error: null,
        }),
      );

    const res = await getWaitEstimate(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ seconds: 480, ordersAhead: 1 }); // 1 ahead * 8min
  });

  it("ignores an unconfigured default_prep_minutes (no vendor row found)", async () => {
    const target = {
      id: "t",
      status: "pending",
      created_at: "2026-06-12T10:05:00Z",
      priority_bumped_at: null,
    };
    fromMock
      .mockReturnValueOnce(chain({ data: target, error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }));

    const res = await getWaitEstimate(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ seconds: null, ordersAhead: 0 });
  });
});

// confirmArrival's write chain (update -> 4x eq -> select) doesn't fit the
// read-only chain() helper above, so this block layers its own from()
// implementation onto the shared createServiceClientMock via
// mockImplementation in its own beforeEach — the file-level beforeEach above
// still runs first each test (outer beforeEach before inner), and this
// describe is the last one in the file so it never leaks into the
// getOrderStatus/getWaitEstimate tests above. Mirrors payment-actions.test.ts's
// claimPayment mock shape exactly.
describe("confirmArrival", () => {
  const writeSelect2 = vi.fn();
  const reread2 = vi.fn();
  const update2 = vi.fn(() => ({
    eq: () => ({
      eq: () => ({ eq: () => ({ eq: () => ({ select: writeSelect2 }) }) }),
    }),
  }));
  const select2 = () => ({
    eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: reread2 }) }) }),
  });

  beforeEach(() => {
    createServiceClientMock.mockImplementation(() =>
      Promise.resolve({ from: () => ({ update: update2, select: select2 }) }),
    );
    update2.mockClear();
    writeSelect2
      .mockReset()
      .mockResolvedValue({ data: [{ id: "o1" }], error: null });
    reread2.mockReset().mockResolvedValue({ data: null });
  });

  it("starts a pending order (update runs, returns success)", async () => {
    const res = await confirmArrival(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
    expect(update2).toHaveBeenCalledWith({ status: "preparing" });
  });

  it("blocks when rate-limited and does not touch the DB", async () => {
    rateLimitMockRef.mockResolvedValue(false);
    const res = await confirmArrival(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Too many attempts. Wait a moment.",
    });
    expect(update2).not.toHaveBeenCalled();
  });

  it("rejects an invalid booth id before creating the client", async () => {
    const res = await confirmArrival("not-a-uuid", ORDER, TOKEN);
    expect(res).toEqual({ success: false, error: "Invalid booth" });
    expect(update2).not.toHaveBeenCalled();
  });

  it("reports a failure when the update errors", async () => {
    writeSelect2.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await confirmArrival(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Could not start your order. Try again.",
    });
  });

  it("stays idempotent on a double-tap (0 rows, already preparing)", async () => {
    writeSelect2.mockResolvedValue({ data: [], error: null });
    reread2.mockResolvedValue({ data: { status: "preparing" } });
    const res = await confirmArrival(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
  });

  it("reports a refresh when the order is not actually pending (0 rows)", async () => {
    writeSelect2.mockResolvedValue({ data: [], error: null });
    reread2.mockResolvedValue({ data: { status: "cancelled" } });
    const res = await confirmArrival(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Could not start your order. Try again.",
    });
  });
});
