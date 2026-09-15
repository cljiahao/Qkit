// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { DashboardTour } from "./dashboard-tour";
import type { TourDefinition } from "@merqo/ui";

// The tour mechanism itself (driver.js lifecycle, auto-run/replay timing,
// mark-seen-once semantics, popover styling, route-to-tour matching) is
// owned and tested by @merqo/ui's own DashboardTour/DashboardTours. This
// file's job is narrower: confirm qkit wires the right props through to
// DashboardTours.
const mocks = vi.hoisted(() => {
  const state = { pathname: "/dashboard", lastProps: null as unknown };
  return {
    state,
    markTourSeen: vi.fn(),
    SharedDashboardTours: vi.fn((props: unknown) => {
      state.lastProps = props;
      return null;
    }),
  };
});

vi.mock("@merqo/ui", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  DashboardTours: mocks.SharedDashboardTours,
}));
vi.mock("@/app/dashboard/tour-actions", () => ({
  markTourSeen: mocks.markTourSeen,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.state.pathname,
}));

type DashboardToursProps = {
  tours: TourDefinition[];
  pathname: string;
  seenTourIds: string[];
  onFirstSeen: (tourId: string) => Promise<void>;
  scopeClassName: string;
};
const props = () => mocks.state.lastProps as DashboardToursProps;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.pathname = "/dashboard";
  mocks.state.lastProps = null;
});

describe("DashboardTour (qkit wrapper)", () => {
  it("registers an orders tour at /dashboard with a lazy matchMedia-resolved steps function", () => {
    render(<DashboardTour toursSeen={{}} />);
    const orders = props().tours.find((t) => t.id === "orders")!;
    expect(orders.route).toBe("/dashboard");
    expect(typeof orders.steps).toBe("function");

    const resolver = orders.steps as () => { element: string }[];
    expect(resolver()).toHaveLength(7); // desktop list (jsdom matchMedia absent)

    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    try {
      expect(resolver()).toHaveLength(5); // mobile list
    } finally {
      window.matchMedia = original;
    }
  });

  it("registers a booths tour at /dashboard/booths with its own steps", () => {
    render(<DashboardTour toursSeen={{}} />);
    const booths = props().tours.find((t) => t.id === "booths")!;
    expect(booths.route).toBe("/dashboard/booths");
    const steps =
      typeof booths.steps === "function" ? booths.steps() : booths.steps;
    expect(steps).toHaveLength(1);
    expect(steps[0].element).toBe('[data-tour="new-booth"]');
  });

  it("derives seenTourIds from the keys of toursSeen", () => {
    render(
      <DashboardTour toursSeen={{ orders: "2026-01-01T00:00:00.000Z" }} />,
    );
    expect(props().seenTourIds).toEqual(["orders"]);
  });

  it("passes an empty seenTourIds for a vendor who has seen no tours", () => {
    render(<DashboardTour toursSeen={{}} />);
    expect(props().seenTourIds).toEqual([]);
  });

  it("passes the current pathname through unchanged", () => {
    mocks.state.pathname = "/dashboard/booths/abc123";
    render(<DashboardTour toursSeen={{}} />);
    expect(props().pathname).toBe("/dashboard/booths/abc123");
  });

  it("onFirstSeen is wired to markTourSeen", () => {
    render(<DashboardTour toursSeen={{}} />);
    expect(props().onFirstSeen).toBe(mocks.markTourSeen);
  });

  it("scopeClassName is qkit-tour", () => {
    render(<DashboardTour toursSeen={{}} />);
    expect(props().scopeClassName).toBe("qkit-tour");
  });
});
