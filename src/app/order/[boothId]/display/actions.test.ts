import { describe, expect, it, vi, beforeEach } from "vitest";
import { getBoothQueueDisplay } from "./actions";

// Chainable stub: every builder method returns itself; the chain is
// awaitable directly (the final orders read never calls a terminal
// .maybeSingle()) and .maybeSingle() also resolves the same result for the
// single-row lookups.
function chain(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.select = self;
  obj.eq = self;
  obj.gte = self;
  obj.not = self;
  obj.order = self;
  obj.limit = self;
  obj.maybeSingle = () => Promise.resolve(result);
  obj.then = (resolve: (v: typeof result) => void) =>
    Promise.resolve(result).then(resolve);
  return obj;
}

const { createServiceClientMock, fromMock } = vi.hoisted(() => {
  const fromMock = vi.fn();
  return {
    createServiceClientMock: vi.fn(
      (): Promise<{ from: (...args: unknown[]) => unknown }> =>
        Promise.resolve({ from: fromMock }),
    ),
    fromMock,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));

const BOOTH = "00000000-0000-4000-8000-000000000001";
const VENDOR = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  createServiceClientMock.mockClear();
  fromMock.mockReset();
});

describe("getBoothQueueDisplay", () => {
  it("returns null when the booth doesn't exist", async () => {
    fromMock.mockReturnValueOnce(chain({ data: null, error: null }));
    const res = await getBoothQueueDisplay(BOOTH);
    expect(res).toBeNull();
  });

  it("returns null and logs on a booth read error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fromMock.mockReturnValueOnce(
      chain({ data: null, error: { message: "boom" } }),
    );
    const res = await getBoothQueueDisplay(BOOTH);
    expect(res).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "getBoothQueueDisplay: booth read failed",
      "boom",
    );
    errorSpy.mockRestore();
  });

  it("returns active orders sorted oldest-first, real order_number by default", async () => {
    const active = [
      {
        order_number: "0002",
        status: "preparing",
        created_at: "2026-06-12T10:05:00Z",
        priority_bumped_at: null,
      },
      {
        order_number: "0001",
        status: "ready",
        created_at: "2026-06-12T10:00:00Z",
        priority_bumped_at: null,
      },
    ];
    fromMock
      .mockReturnValueOnce(chain({ data: { vendor_id: VENDOR }, error: null })) // booth
      .mockReturnValueOnce(chain({ data: null, error: null })) // vendor (no reset setting)
      .mockReturnValueOnce(chain({ data: active, error: null })); // orders

    const res = await getBoothQueueDisplay(BOOTH);
    expect(res).toEqual([
      { orderNumber: "0001", displayNumber: "0001", status: "ready" },
      { orderNumber: "0002", displayNumber: "0002", status: "preparing" },
    ]);
  });

  it("computes daily-reset display numbers when the vendor has it enabled", async () => {
    const active = [
      {
        order_number: "0105",
        status: "ready",
        created_at: "2026-06-12T10:00:00Z",
        priority_bumped_at: null,
      },
    ];
    fromMock
      .mockReturnValueOnce(chain({ data: { vendor_id: VENDOR }, error: null })) // booth
      .mockReturnValueOnce(
        chain({
          data: {
            board_settings: {
              aging_min: 5,
              overdue_min: 10,
              sound_id: "chime",
              desktop_notify: false,
              undo_seconds: 5,
              daily_order_number_reset: true,
              show_wait_estimate: true,
              default_prep_minutes: null,
              ready_auto_clear_min: null,
            },
          },
          error: null,
        }),
      ) // vendor
      .mockReturnValueOnce(
        chain({ data: { order_number: "0100" }, error: null }),
      ) // first-today baseline
      .mockReturnValueOnce(chain({ data: active, error: null })); // orders

    const res = await getBoothQueueDisplay(BOOTH);
    expect(res).toEqual([
      { orderNumber: "0105", status: "ready", displayNumber: "006" },
    ]);
  });

  it("puts a priority-bumped order first even if it's newer", async () => {
    const active = [
      {
        order_number: "0001",
        status: "preparing",
        created_at: "2026-06-12T10:00:00Z",
        priority_bumped_at: null,
      },
      {
        order_number: "0002",
        status: "preparing",
        created_at: "2026-06-12T10:05:00Z",
        priority_bumped_at: "2026-06-12T10:06:00Z",
      },
    ];
    fromMock
      .mockReturnValueOnce(chain({ data: { vendor_id: VENDOR }, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: active, error: null }));

    const res = await getBoothQueueDisplay(BOOTH);
    expect(res?.map((o) => o.orderNumber)).toEqual(["0002", "0001"]);
  });

  it("returns null and logs on an orders read error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fromMock
      .mockReturnValueOnce(chain({ data: { vendor_id: VENDOR }, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: { message: "boom" } }));

    const res = await getBoothQueueDisplay(BOOTH);
    expect(res).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "getBoothQueueDisplay: orders read failed",
      "boom",
    );
    errorSpy.mockRestore();
  });
});
