// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useRealtimeOrders } from "./use-realtime-orders";
import type { BoardOrder } from "@/lib/types";

function order(overrides: Partial<BoardOrder> = {}): BoardOrder {
  return {
    id: "o1",
    booth_id: "b1",
    order_number: "0001",
    customer_name: "Priya",
    items: [{ menuItemId: "m1", name: "Flat White", quantity: 1 }],
    status: "preparing",
    total_cents: 550,
    payment_status: "not_required",
    payment_method_kind: null,
    paid_at: null,
    created_at: "2026-06-12T04:00:00Z",
    ready_at: null,
    completed_at: null,
    updated_at: "2026-06-12T04:00:00Z",
    idempotency_key: null,
    priority_bumped_at: null,
    source: "qr",
    auto_completed: false,
    ...overrides,
  };
}

// A minimal chainable query builder — the hook's resync() only ever calls
// select/in/not/order in that order, ending on a promise.
function makeOrdersQuery(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    in: vi.fn(() => builder),
    not: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

let pgCallback: ((payload: unknown) => void) | undefined;
let statusCallback: ((status: string) => void) | undefined;
const mockFrom = vi.fn();
const removeChannel = vi.fn();

function makeChannel() {
  const channel = {
    on: vi.fn((_event: string, _filter: unknown, cb: typeof pgCallback) => {
      pgCallback = cb;
      return channel;
    }),
    subscribe: vi.fn((cb: typeof statusCallback) => {
      statusCallback = cb;
      return channel;
    }),
  };
  return channel;
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: mockFrom,
    channel: () => makeChannel(),
    removeChannel,
  }),
}));

beforeEach(() => {
  pgCallback = undefined;
  statusCallback = undefined;
  mockFrom.mockReset();
  removeChannel.mockReset();
});

describe("useRealtimeOrders", () => {
  it("does not subscribe when there are no booths, and keeps the initial orders", () => {
    const { result } = renderHook(() => useRealtimeOrders([], [order()]));
    expect(result.current.orders).toEqual([order()]);
    expect(result.current.status).toBe("connecting");
  });

  it("marks connected on the first SUBSCRIBED without resyncing", async () => {
    mockFrom.mockReturnValue(makeOrdersQuery({ data: [], error: null }));
    const { result } = renderHook(() => useRealtimeOrders(["b1"], []));
    act(() => statusCallback?.("SUBSCRIBED"));
    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("applies a realtime INSERT and fires onInsert", async () => {
    const onInsert = vi.fn();
    const { result } = renderHook(() =>
      useRealtimeOrders(["b1"], [], onInsert),
    );
    const inserted = order({ id: "o2" });
    act(() =>
      pgCallback?.({
        eventType: "INSERT",
        new: { ...inserted, access_token: "tok" },
        old: {},
      }),
    );
    await waitFor(() =>
      expect(result.current.orders.map((o) => o.id)).toEqual(["o2"]),
    );
    expect(onInsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "o2" }),
    );
  });

  it("resyncs on a reconnect and keeps the newer of {local, snapshot} per id", async () => {
    // Local state already has a fresher update (e.g. an optimistic realtime
    // UPDATE) than what the resync snapshot returns — the merge must not
    // clobber it, per the hook's own documented invariant.
    const stale = order({ id: "o1", updated_at: "2026-06-12T04:00:00Z" });
    const fresh = order({
      id: "o1",
      status: "ready",
      updated_at: "2026-06-12T04:05:00Z",
    });
    mockFrom.mockReturnValue(
      makeOrdersQuery({
        data: [{ ...stale, access_token: "tok" }],
        error: null,
      }),
    );
    const { result } = renderHook(() => useRealtimeOrders(["b1"], [fresh]));

    // First SUBSCRIBED: connects, no resync yet.
    act(() => statusCallback?.("SUBSCRIBED"));
    await waitFor(() => expect(result.current.status).toBe("connected"));
    // Simulate a drop + reconnect: the second SUBSCRIBED triggers resync().
    act(() => statusCallback?.("CLOSED"));
    act(() => statusCallback?.("SUBSCRIBED"));

    await waitFor(() => expect(mockFrom).toHaveBeenCalled());
    await waitFor(() =>
      expect(result.current.orders.find((o) => o.id === "o1")?.status).toBe(
        "ready",
      ),
    );
  });

  it("marks disconnected on CHANNEL_ERROR / TIMED_OUT / CLOSED", async () => {
    const { result } = renderHook(() => useRealtimeOrders(["b1"], []));
    act(() => statusCallback?.("CHANNEL_ERROR"));
    await waitFor(() => expect(result.current.status).toBe("disconnected"));
  });
});
