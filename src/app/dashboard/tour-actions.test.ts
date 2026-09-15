import { describe, it, expect, vi, beforeEach } from "vitest";

let vendorRow: { tours_seen: Record<string, string> } | null = {
  tours_seen: { orders: "2026-01-01T00:00:00.000Z" },
};
let getUserResult: { data: { user: { id: string } | null } } = {
  data: { user: { id: "vendor-1" } },
};
type UpdatePayload = { tours_seen: Record<string, string> };
const update = vi.fn((_payload: UpdatePayload) => ({
  eq: (): Promise<{ error: { message: string } | null }> =>
    Promise.resolve({ error: null }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: { getUser: () => Promise.resolve(getUserResult) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: vendorRow }) }),
      }),
      update,
    }),
  }),
}));

import { markTourSeen } from "./tour-actions";

beforeEach(() => {
  update.mockClear();
  vendorRow = { tours_seen: { orders: "2026-01-01T00:00:00.000Z" } };
  getUserResult = { data: { user: { id: "vendor-1" } } };
});

describe("markTourSeen", () => {
  it("merges the new tourId in without clobbering an already-seen tour", async () => {
    await markTourSeen("booths");
    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0]![0];
    expect(payload.tours_seen.orders).toBe("2026-01-01T00:00:00.000Z");
    expect(typeof payload.tours_seen.booths).toBe("string");
  });

  it("re-marking an already-seen tour only updates that tour's own timestamp", async () => {
    await markTourSeen("orders");
    const payload = update.mock.calls[0]![0];
    expect(payload.tours_seen.orders).not.toBe("2026-01-01T00:00:00.000Z");
    expect(Object.keys(payload.tours_seen)).toEqual(["orders"]);
  });

  it("writes just the new tourId when the vendor has no tours_seen entries yet", async () => {
    vendorRow = { tours_seen: {} };
    await markTourSeen("booths");
    const payload = update.mock.calls[0]![0];
    expect(Object.keys(payload.tours_seen)).toEqual(["booths"]);
  });

  it("does nothing when no user is signed in", async () => {
    getUserResult = { data: { user: null } };
    await markTourSeen("booths");
    expect(update).not.toHaveBeenCalled();
  });

  it("never throws when the update fails", async () => {
    update.mockReturnValueOnce({
      eq: () => Promise.resolve({ error: { message: "boom" } }),
    });
    await expect(markTourSeen("booths")).resolves.toBeUndefined();
  });
});
