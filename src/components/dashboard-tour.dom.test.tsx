// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardTour } from "./dashboard-tour";

const mocks = vi.hoisted(() => {
  const state = { pathname: "/dashboard", lastConfig: null as unknown };
  const drive = vi.fn();
  const destroy = vi.fn();
  return {
    state,
    drive,
    destroy,
    push: vi.fn(),
    markTourSeen: vi.fn(),
    driver: vi.fn((config: unknown) => {
      state.lastConfig = config;
      return { drive, destroy };
    }),
  };
});

vi.mock("driver.js", () => ({ driver: mocks.driver }));
vi.mock("@/app/dashboard/tour-actions", () => ({
  markTourSeen: mocks.markTourSeen,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.state.pathname,
  useRouter: () => ({ push: mocks.push }),
}));

type DriverConfig = { onDestroyed?: () => void; steps: unknown[] };
const config = () => mocks.state.lastConfig as DriverConfig;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.pathname = "/dashboard";
  mocks.state.lastConfig = null;
});

describe("DashboardTour", () => {
  it("renders the floating replay button", () => {
    render(<DashboardTour seen={true} />);
    expect(
      screen.getByRole("button", { name: /replay onboarding tour/i }),
    ).toHaveAttribute("data-tour", "tour-replay");
  });

  it("auto-runs on /dashboard for a vendor who hasn't seen it", async () => {
    render(<DashboardTour seen={false} />);
    await waitFor(() => expect(mocks.drive).toHaveBeenCalledTimes(1));
    expect(config().steps).toHaveLength(5); // desktop list (jsdom matchMedia absent)
  });

  it("uses the 3-step mobile list on a narrow viewport", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    try {
      render(<DashboardTour seen={false} />);
      await waitFor(() => expect(mocks.drive).toHaveBeenCalled());
      expect(config().steps).toHaveLength(3);
    } finally {
      window.matchMedia = original;
    }
  });

  it("does not auto-run when already seen", async () => {
    render(<DashboardTour seen={true} />);
    // give the rAF a chance to fire
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(mocks.drive).not.toHaveBeenCalled();
  });

  it("does not auto-run off the order board, even if unseen", async () => {
    mocks.state.pathname = "/dashboard/stats";
    render(<DashboardTour seen={false} />);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(mocks.drive).not.toHaveBeenCalled();
  });

  it("replays on button click even for a seen vendor", async () => {
    render(<DashboardTour seen={true} />);
    await userEvent.click(
      screen.getByRole("button", { name: /replay onboarding tour/i }),
    );
    // start() lazy-imports driver.js, so the drive() call resolves a tick later.
    await waitFor(() => expect(mocks.drive).toHaveBeenCalledTimes(1));
  });

  it("stamps tour-seen as soon as the auto-run tour starts, so a mid-tour refresh does not re-trigger it", async () => {
    render(<DashboardTour seen={false} />);
    await waitFor(() => expect(mocks.drive).toHaveBeenCalledTimes(1));
    expect(mocks.markTourSeen).toHaveBeenCalledTimes(1);

    // Finishing later, or a subsequent replay, must not re-stamp.
    config().onDestroyed?.();
    expect(mocks.markTourSeen).toHaveBeenCalledTimes(1);
    await userEvent.click(
      screen.getByRole("button", { name: /replay onboarding tour/i }),
    );
    await waitFor(() => expect(mocks.drive).toHaveBeenCalledTimes(2));
    config().onDestroyed?.();
    expect(mocks.markTourSeen).toHaveBeenCalledTimes(1);
  });

  it("never stamps tour-seen when a seen vendor replays", async () => {
    render(<DashboardTour seen={true} />);
    await userEvent.click(
      screen.getByRole("button", { name: /replay onboarding tour/i }),
    );
    await waitFor(() => expect(mocks.drive).toHaveBeenCalled());
    config().onDestroyed?.();
    expect(mocks.markTourSeen).not.toHaveBeenCalled();
  });

  it("routes to /dashboard first when replayed from another page", async () => {
    mocks.state.pathname = "/dashboard/stats";
    render(<DashboardTour seen={true} />);
    await userEvent.click(
      screen.getByRole("button", { name: /replay onboarding tour/i }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });
});
