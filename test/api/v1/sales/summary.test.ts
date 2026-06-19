import { describe, it, expect, vi, beforeEach } from "vitest";

// Handler-glue test for GET /api/v1/sales/summary. The pure helpers it calls
// (computeStats, toSalesSummaryV1, parseOrderItems) are unit-tested elsewhere;
// here we verify the route's own logic: 401 when unauthenticated, entitlement
// range-clamping, and booth-filter scoping to the vendor's own booths.
//
// Mock the two server dependencies: loadEntitlement (auth + plan) and the
// Supabase server client (booths + orders reads). vi.hoisted so the fns exist
// before the hoisted vi.mock factories run.
const { loadEntitlementMock, fromMock } = vi.hoisted(() => ({
  loadEntitlementMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/supabase/get-entitlement", () => ({
  loadEntitlement: loadEntitlementMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ from: fromMock })),
}));

import { GET } from "@/app/api/v1/sales/summary/route";

// A chainable, awaitable query-builder stub. Every builder method returns the
// same object; awaiting it resolves to { data } — mirroring supabase-js.
function queryResult(data: unknown) {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    in: () => b,
    gte: () => b,
    then: (resolve: (v: { data: unknown }) => unknown) => resolve({ data }),
  };
  return b;
}

// Route the two `from(...)` calls (booths, then orders) to preset results.
function wireSupabase(booths: { id: string }[], orders: unknown[] = []) {
  fromMock.mockImplementation((table: string) =>
    queryResult(table === "booths" ? booths : orders),
  );
}

const authed = (statsRanges: string[]) => ({
  user: { id: "v1" },
  vendor: { id: "v1" },
  entitlement: { statsRanges },
  licenseExpiresAt: null,
});

function req(query = "") {
  return new Request(`http://localhost/api/v1/sales/summary${query}`);
}

beforeEach(() => {
  loadEntitlementMock.mockReset();
  fromMock.mockReset();
});

describe("GET /api/v1/sales/summary", () => {
  it("returns 401 when there is no authenticated vendor", async () => {
    loadEntitlementMock.mockResolvedValue({
      user: null,
      vendor: null,
      entitlement: { statsRanges: ["24h"] },
      licenseExpiresAt: null,
    });

    const res = await GET(req("?range=7d"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    // Never reached the data layer.
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("passes through a range the vendor is entitled to", async () => {
    loadEntitlementMock.mockResolvedValue(authed(["24h", "7d", "30d"]));
    wireSupabase([{ id: "b1" }]);

    const res = await GET(req("?range=30d"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.range).toBe("30d");
  });

  it("clamps an out-of-plan range to the largest allowed range", async () => {
    // Vendor entitled only to 24h/7d; asking for 90d clamps to allowed.at(-1).
    loadEntitlementMock.mockResolvedValue(authed(["24h", "7d"]));
    wireSupabase([{ id: "b1" }]);

    const res = await GET(req("?range=90d"));
    const body = await res.json();

    expect(body.range).toBe("7d");
  });

  it("defaults to 7d when no range is supplied (and it is allowed)", async () => {
    loadEntitlementMock.mockResolvedValue(authed(["24h", "7d", "30d"]));
    wireSupabase([{ id: "b1" }]);

    const res = await GET(req());
    const body = await res.json();

    expect(body.range).toBe("7d");
  });

  it("scopes a booth filter to the vendor's own booths", async () => {
    loadEntitlementMock.mockResolvedValue(authed(["24h", "7d"]));
    wireSupabase([{ id: "b1" }, { id: "b2" }]);

    const res = await GET(req("?booth=b1"));
    const body = await res.json();

    expect(body.booth_id).toBe("b1");
  });

  it("falls back to 'all' when the requested booth is not owned", async () => {
    loadEntitlementMock.mockResolvedValue(authed(["24h", "7d"]));
    wireSupabase([{ id: "b1" }, { id: "b2" }]);

    const res = await GET(req("?booth=someone-elses-booth"));
    const body = await res.json();

    expect(body.booth_id).toBe("all");
  });
});
