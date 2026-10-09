// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ENTITLEMENTS } from "@/lib/plan";
import type { ComponentProps } from "react";
import type { StatsView as StatsComponent } from "./stats-view";

const {
  entitlement,
  fixtures,
  predicates,
  orders,
  reviews,
  totals,
  controls,
  view,
  eventView,
} = vi.hoisted(() => ({
  entitlement: vi.fn(),
  fixtures: { booths: [] as unknown[], licenses: [] as unknown[] },
  predicates: vi.fn(),
  orders: vi.fn(),
  reviews: vi.fn(),
  totals: vi.fn(),
  controls: vi.fn(),
  view: vi.fn(),
  eventView: vi.fn(),
}));
vi.mock("@/lib/supabase/get-entitlement", () => ({
  requireEntitledVendor: entitlement,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    from: (table: keyof typeof fixtures) => ({
      select: () => ({
        eq: (column: string, id: string) => {
          predicates(table, column, id);
          const query = {
            order: () => query,
            range: async (from: number, to: number) => ({
              data: fixtures[table].slice(from, Math.min(to + 1, from + 2)),
              error: null,
            }),
          };
          return query;
        },
      }),
    }),
  }),
}));
vi.mock("./queries", () => ({
  fetchOrders: orders,
  fetchReviewRows: reviews,
  fetchAllTimeTotals: totals,
}));
vi.mock("./stats-controls", () => ({
  StatsControls: (props: unknown) => {
    controls(props);
    return null;
  },
}));
vi.mock("./stats-view", () => ({
  StatsView: (props: unknown) => {
    view(props);
    return <p>Live statistics</p>;
  },
}));
vi.mock("./event-stats-view", () => ({
  EventStatsView: (props: unknown) => {
    eventView(props);
    return <p>Event statistics</p>;
  },
}));
vi.mock("./events-panel", () => ({ EventsPanel: () => null }));
vi.mock("./reviews-card", () => ({ ReviewsCard: () => null }));
import StatsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  entitlement.mockResolvedValue({
    vendor: { id: "vendor-a" },
    entitlement: ENTITLEMENTS.free,
  });
  fixtures.booths = [
    { id: "booth-a", name: "Coffee" },
    { id: "booth-b", name: "Tea" },
  ];
  fixtures.licenses = [];
  orders.mockResolvedValue([]);
  reviews.mockResolvedValue([]);
  totals.mockResolvedValue({ orders: 1200, revenue_cents: 240000 });
});

describe("vendor stats page boundaries", () => {
  it("includes booths and paid events beyond the database response cap", async () => {
    fixtures.booths.push({ id: "booth-c", name: "Juice" });
    const event = {
      id: "event-c",
      label: "Older market",
      valid_from: "2026-08-01T00:00:00Z",
      expires_at: "2026-08-02T00:00:00Z",
    };
    fixtures.licenses = [
      { ...event, id: "event-a" },
      { ...event, id: "event-b" },
      event,
    ];
    render(
      await StatsPage({ searchParams: Promise.resolve({ event: event.id }) }),
    );
    expect(eventView).toHaveBeenCalledWith(
      expect.objectContaining({
        activeEvent: event,
        allBoothIds: ["booth-a", "booth-b", "booth-c"],
      }),
    );
    expect(orders).not.toHaveBeenCalled();
  });
  it("clamps free vendors to one day and ignores another vendor's booth filter", async () => {
    render(
      await StatsPage({
        searchParams: Promise.resolve({ range: "90d", booth: "foreign-booth" }),
      }),
    );
    expect(screen.getByText("Live statistics")).toBeInTheDocument();
    expect(controls).toHaveBeenCalledWith(
      expect.objectContaining({ range: "24h", booth: "all" }),
    );
    expect(orders).toHaveBeenCalledOnce();
    expect(orders.mock.calls[0][1]).toEqual(["booth-a", "booth-b"]);
    expect(predicates).toHaveBeenCalledWith("booths", "vendor_id", "vendor-a");
    expect(predicates).toHaveBeenCalledWith(
      "licenses",
      "vendor_id",
      "vendor-a",
    );
    expect(view).toHaveBeenCalledWith(
      expect.objectContaining({ pro: false, series: null, deltas: null }),
    );
  });
  it("compares Pro periods while keeping lifetime totals across all booths", async () => {
    entitlement.mockResolvedValue({
      vendor: { id: "vendor-a" },
      entitlement: ENTITLEMENTS.pro,
    });
    render(
      await StatsPage({
        searchParams: Promise.resolve({ range: "30d", booth: "booth-b" }),
      }),
    );
    expect(controls).toHaveBeenCalledWith(
      expect.objectContaining({ range: "30d", booth: "booth-b" }),
    );
    expect(orders).toHaveBeenCalledTimes(2);
    expect(orders.mock.calls[0][1]).toEqual(["booth-b"]);
    expect(orders.mock.calls[1][1]).toEqual(["booth-b"]);
    expect(totals.mock.calls[0][1]).toEqual(["booth-a", "booth-b"]);
    const stats = view.mock.calls[0][0] as ComponentProps<
      typeof StatsComponent
    >;
    expect(stats.pro).toBe(true);
    expect(stats.series?.length).toBeGreaterThan(0);
    expect(stats.allTime).toEqual({ orders: 1200, revenue_cents: 240000 });
  });
  it.each([undefined, "not-a-range"])(
    "uses a supported default for range=%s",
    async (range) => {
      entitlement.mockResolvedValue({
        vendor: { id: "vendor-a" },
        entitlement: ENTITLEMENTS.pro,
      });
      render(await StatsPage({ searchParams: Promise.resolve({ range }) }));
      expect(controls).toHaveBeenCalledWith(
        expect.objectContaining({ range: "7d" }),
      );
    },
  );
  it("allows a paid historical event without a current Pro subscription", async () => {
    const event = {
      id: "event-a",
      label: "Market",
      valid_from: "2026-09-01T00:00:00Z",
      expires_at: "2026-09-02T00:00:00Z",
    };
    fixtures.licenses = [event];
    render(
      await StatsPage({ searchParams: Promise.resolve({ event: "event-a" }) }),
    );
    expect(screen.getByText("Event statistics")).toBeInTheDocument();
    expect(eventView).toHaveBeenCalledWith(
      expect.objectContaining({
        activeEvent: event,
        allBoothIds: ["booth-a", "booth-b"],
      }),
    );
    expect(orders).not.toHaveBeenCalled();
  });
  it("does not grant an event view for an unowned event id", async () => {
    render(
      await StatsPage({
        searchParams: Promise.resolve({ event: "foreign-event" }),
      }),
    );
    expect(eventView).not.toHaveBeenCalled();
    expect(view).toHaveBeenCalledOnce();
  });
  it("skips prior-period queries when a Pro vendor has no booths", async () => {
    fixtures.booths = [];
    entitlement.mockResolvedValue({
      vendor: { id: "vendor-a" },
      entitlement: ENTITLEMENTS.pro,
    });
    render(await StatsPage({ searchParams: Promise.resolve({}) }));
    expect(orders).toHaveBeenCalledOnce();
    expect(view).toHaveBeenCalledWith(
      expect.objectContaining({ deltas: null, series: null }),
    );
  });
});
