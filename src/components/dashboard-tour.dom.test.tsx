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
    expect(config().steps.length).toBeGreaterThan(0);
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
    expect(mocks.drive).toHaveBeenCalledTimes(1);
  });

  it("stamps tour-seen once when the auto-run tour ends, not on a later replay", async () => {
    render(<DashboardTour seen={false} />);
    await waitFor(() => expect(mocks.drive).toHaveBeenCalled());

    config().onDestroyed?.(); // finish/skip the first run
    expect(mocks.markTourSeen).toHaveBeenCalledTimes(1);

    // A subsequent replay must not re-stamp (already seen this session).
    await userEvent.click(
      screen.getByRole("button", { name: /replay onboarding tour/i }),
    );
    config().onDestroyed?.();
    expect(mocks.markTourSeen).toHaveBeenCalledTimes(1);
  });

  it("never stamps tour-seen when a seen vendor replays", async () => {
    render(<DashboardTour seen={true} />);
    await userEvent.click(
      screen.getByRole("button", { name: /replay onboarding tour/i }),
    );
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
