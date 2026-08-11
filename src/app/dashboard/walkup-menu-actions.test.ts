import { describe, expect, it, vi, beforeEach } from "vitest";
import { getWalkupMenu } from "./walkup-menu-actions";

function chain(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.select = self;
  obj.eq = self;
  obj.maybeSingle = () => Promise.resolve(result);
  return obj;
}

const { fromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => Promise.resolve({ from: fromMock, rpc: rpcMock }),
}));

const BOOTH_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset().mockResolvedValue({ data: {}, error: null });
});

describe("getWalkupMenu", () => {
  it("returns null for an invalid booth id without querying", async () => {
    const res = await getWalkupMenu("not-a-uuid");
    expect(res).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns null when the booth isn't found (RLS-scoped)", async () => {
    fromMock.mockReturnValue(chain({ data: null, error: null }));
    const res = await getWalkupMenu(BOOTH_ID);
    expect(res).toBeNull();
  });

  it("returns parsed menu items and remaining stock, no payment configured", async () => {
    fromMock.mockReturnValue(
      chain({
        data: {
          id: BOOTH_ID,
          menu_items: [
            {
              id: "m1",
              name: "Kopi",
              description: "",
              available: true,
              price_cents: 350,
            },
          ],
          payment: null,
        },
        error: null,
      }),
    );
    rpcMock.mockResolvedValue({ data: { m1: 4 }, error: null });

    const res = await getWalkupMenu(BOOTH_ID);

    expect(rpcMock).toHaveBeenCalledWith("booth_remaining_stock", {
      p_booth_id: BOOTH_ID,
    });
    expect(res).toEqual({
      menuItems: [
        {
          id: "m1",
          name: "Kopi",
          description: "",
          available: true,
          price_cents: 350,
        },
      ],
      remaining: { m1: 4 },
      expectsPayment: false,
      paymentKind: null,
    });
  });

  it("reports expectsPayment=true for a configured payment kind", async () => {
    fromMock.mockReturnValue(
      chain({
        data: {
          id: BOOTH_ID,
          menu_items: [],
          payment: {
            kind: "paynow",
            payee_name: "Kopi Corner",
            uen: "12345678A",
          },
        },
        error: null,
      }),
    );
    const res = await getWalkupMenu(BOOTH_ID);
    expect(res?.expectsPayment).toBe(true);
    expect(res?.paymentKind).toBe("paynow");
  });

  it("reports expectsPayment=true for the minimal {kind} marker the paykit cutover now stores", async () => {
    fromMock.mockReturnValue(
      chain({
        data: {
          id: BOOTH_ID,
          menu_items: [],
          payment: { kind: "pointer" },
        },
        error: null,
      }),
    );
    const res = await getWalkupMenu(BOOTH_ID);
    expect(res?.expectsPayment).toBe(true);
    expect(res?.paymentKind).toBe("pointer");
  });

  it("treats a stripe config as not expecting payment (reserved, dark)", async () => {
    fromMock.mockReturnValue(
      chain({
        data: {
          id: BOOTH_ID,
          menu_items: [],
          payment: { kind: "stripe", account_id: "acct_1" },
        },
        error: null,
      }),
    );
    const res = await getWalkupMenu(BOOTH_ID);
    expect(res?.expectsPayment).toBe(false);
  });

  it("drops malformed menu item entries", async () => {
    fromMock.mockReturnValue(
      chain({
        data: { id: BOOTH_ID, menu_items: [{ bogus: true }], payment: null },
        error: null,
      }),
    );
    const res = await getWalkupMenu(BOOTH_ID);
    expect(res?.menuItems).toEqual([]);
  });
});
