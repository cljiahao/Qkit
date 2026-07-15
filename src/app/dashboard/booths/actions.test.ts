import { describe, expect, it, vi, beforeEach } from "vitest";
import { ENTITLEMENTS } from "@/lib/plan";
import type { BoothFormInput } from "@/lib/schemas";
import { saveBooth } from "./actions";

// Mock the entitlement loader and the supabase server client. saveBooth's entry
// order is: parse → loadEntitlement → count-cap checks (no DB) → strip
// hours/stock → createServerClient → active-booth gate → insert|update.
//
// The supabase client models the three "booths" chains saveBooth uses:
//  - active-booth COUNT:  select("id",{count,head:true}).eq.eq[.neq]  (awaited directly)
//  - INSERT (create):     insert(row).select("id").single()
//  - UPDATE (edit):       update(row).eq("id").select("id").maybeSingle()
//                         (preceded by a prev-image read select().eq().maybeSingle())
const h = vi.hoisted(() => {
  const state = {
    count: 0 as number,
    countError: null as { message: string } | null,
    insertResult: { data: { id: "b-new" }, error: null } as {
      data: { id: string } | null;
      error: { message: string } | null;
    },
    updateResult: { data: { id: "b-edit" }, error: null } as {
      data: { id: string } | null;
      error: { message: string } | null;
    },
    prevResult: { data: null } as { data: unknown },
  };
  return {
    state,
    loadEntitlementMock: vi.fn(),
    insertSpy: vi.fn(),
    updateSpy: vi.fn(),
    neqSpy: vi.fn(),
  };
});

vi.mock("@/lib/supabase/get-entitlement", () => ({
  loadEntitlement: h.loadEntitlementMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () =>
    Promise.resolve({
      from: () => ({
        select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head) {
            // Active-booth COUNT query — the builder itself is awaited.
            const builder = {
              eq: () => builder,
              neq: (...args: unknown[]) => {
                h.neqSpy(...args);
                return builder;
              },
              then: (
                resolve: (v: {
                  count: number;
                  error: { message: string } | null;
                }) => void,
              ) => resolve({ count: h.state.count, error: h.state.countError }),
            };
            return builder;
          }
          // Prev-image read on the update path.
          return {
            eq: () => ({
              maybeSingle: () => Promise.resolve(h.state.prevResult),
            }),
          };
        },
        insert: (row: unknown) => {
          h.insertSpy(row);
          return {
            select: () => ({
              single: () => Promise.resolve(h.state.insertResult),
            }),
          };
        },
        update: (row: unknown) => {
          h.updateSpy(row);
          return {
            eq: () => ({
              select: () => ({
                maybeSingle: () => Promise.resolve(h.state.updateResult),
              }),
            }),
          };
        },
      }),
      storage: {
        from: () => ({ remove: () => Promise.resolve({ error: null }) }),
      },
    }),
}));

const BOOTH_ID = "00000000-0000-4000-8000-000000000001";

type MenuItem = BoothFormInput["menu_items"][number];

function makeItem(over: Partial<MenuItem> = {}): MenuItem {
  return {
    id: "i1",
    name: "Coffee",
    description: "",
    available: true,
    ...over,
  };
}

function makeBooth(over: Partial<BoothFormInput> = {}): BoothFormInput {
  return {
    name: "Kopitiam Cart",
    image_url: null,
    is_active: false,
    hours: null,
    menu_items: [makeItem()],
    payment: null,
    social_links: null,
    ...over,
  };
}

beforeEach(() => {
  h.loadEntitlementMock
    .mockReset()
    .mockResolvedValue({ user: { id: "v1" }, entitlement: ENTITLEMENTS.free });
  h.insertSpy.mockReset();
  h.updateSpy.mockReset();
  h.neqSpy.mockReset();
  h.state.count = 0;
  h.state.countError = null;
  h.state.insertResult = { data: { id: "b-new" }, error: null };
  h.state.updateResult = { data: { id: "b-edit" }, error: null };
  h.state.prevResult = { data: null };
});

describe("saveBooth entitlement enforcement", () => {
  it("(a) rejects a menu over the item cap before any DB write", async () => {
    const menu_items = Array.from({ length: 7 }, (_, i) =>
      makeItem({ id: `i${i}`, name: `Item ${i}` }),
    );
    const res = await saveBooth(makeBooth({ menu_items }));

    expect(res).toEqual({
      success: false,
      error: "Your plan allows up to 6 menu items. Remove some or upgrade.",
    });
    expect(h.insertSpy).not.toHaveBeenCalled();
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it("(b) rejects an item over the option-group cap before any DB write", async () => {
    const option_groups = Array.from({ length: 4 }, (_, i) => ({
      id: `g${i}`,
      label: `Group ${i}`,
      choices: [{ id: "c", label: "Choice" }],
    }));
    const res = await saveBooth(
      makeBooth({ menu_items: [makeItem({ option_groups })] }),
    );

    expect(res).toEqual({
      success: false,
      error:
        "Your plan allows up to 3 customization groups per item. Upgrade for more.",
    });
    expect(h.insertSpy).not.toHaveBeenCalled();
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it("(c) silently strips hours and per-item stock on a free-plan save", async () => {
    const input = makeBooth({
      hours: { mode: "daily", open: "09:00", close: "17:00" },
      menu_items: [makeItem({ stock: 10 })],
    });
    // Sanity: the input really did carry the fields we expect to be dropped.
    expect(input.hours).not.toBeNull();
    expect(input.menu_items[0]).toHaveProperty("stock", 10);

    const res = await saveBooth(input);

    expect(res).toEqual({ success: true, boothId: "b-new" });
    expect(h.insertSpy).toHaveBeenCalledTimes(1);
    const row = h.insertSpy.mock.calls[0][0] as {
      hours: unknown;
      menu_items: Array<Record<string, unknown>>;
      vendor_id: string;
    };
    expect(row.hours).toBeNull();
    expect(row.menu_items[0]).not.toHaveProperty("stock");
    expect(row.vendor_id).toBe("v1");
  });

  it("(d) rejects activating a 2nd booth when one active booth already exists", async () => {
    h.state.count = 1; // one OTHER active booth
    const res = await saveBooth(makeBooth({ is_active: true }));

    expect(res).toEqual({
      success: false,
      error:
        "Your plan serves 1 active booth at a time. Deactivate another booth first, or upgrade.",
    });
    expect(h.insertSpy).not.toHaveBeenCalled();
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it("(e) allows re-activating the SAME booth being edited (excluded via neq)", async () => {
    // The only active booth is this one — the query excludes it, so count is 0.
    h.state.count = 0;
    const res = await saveBooth(
      makeBooth({ boothId: BOOTH_ID, is_active: true }),
    );

    expect(res).toEqual({ success: true, boothId: "b-edit" });
    expect(h.neqSpy).toHaveBeenCalledWith("id", BOOTH_ID);
    expect(h.updateSpy).toHaveBeenCalledTimes(1);
    expect(h.insertSpy).not.toHaveBeenCalled();
  });
});
