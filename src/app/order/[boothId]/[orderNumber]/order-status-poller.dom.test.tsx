// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderStatusPoller } from "./order-status-poller";
import type { OrderStatus } from "@/lib/types";

const { getOrderStatus, getWaitEstimate, alerts } = vi.hoisted(() => ({
  getOrderStatus: vi.fn(),
  getWaitEstimate: vi.fn(),
  alerts: {
    isNotifySupported: vi.fn(() => true),
    notifyPermission: vi.fn((): NotificationPermission | null => "default"),
    requestNotifyPermission: vi.fn(
      async () => "granted" as NotificationPermission,
    ),
    fireReadyNotification: vi.fn(async () => undefined),
    playReadyChime: vi.fn(async () => true),
    unlockAudio: vi.fn(),
  },
}));

vi.mock("./status-actions", () => ({ getOrderStatus, getWaitEstimate }));
vi.mock("@/lib/order-alerts", () => alerts);

function renderPoller(initialStatus: OrderStatus = "preparing") {
  return render(
    <OrderStatusPoller
      boothId="b1"
      orderNumber="0007"
      token="tok"
      initialStatus={initialStatus}
      boothName="Kopi Cart"
      placedAt="2026-07-04T00:00:00Z"
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  alerts.isNotifySupported.mockReturnValue(true);
  alerts.notifyPermission.mockReturnValue("default");
  getWaitEstimate.mockResolvedValue({ seconds: null, ordersAhead: 0 });
});

describe("OrderStatusPoller", () => {
  it("polls on mount and reflects a status change", async () => {
    getOrderStatus.mockResolvedValue("ready");
    renderPoller("preparing");

    await waitFor(() =>
      expect(
        screen.getByText("Your order is ready for pickup!"),
      ).toBeInTheDocument(),
    );
    expect(getOrderStatus).toHaveBeenCalledWith("b1", "0007", "tok");
  });

  it("alerts the customer when the order becomes ready", async () => {
    getOrderStatus.mockResolvedValue("ready");
    renderPoller("preparing");

    await waitFor(() =>
      expect(alerts.fireReadyNotification).toHaveBeenCalledWith(
        "Kopi Cart",
        "0007",
        expect.any(String),
      ),
    );
    // Tab is visible in jsdom, so it chimes immediately.
    expect(alerts.playReadyChime).toHaveBeenCalled();
  });

  it("shows a 'placed' time stamp once mounted", async () => {
    getOrderStatus.mockResolvedValue("preparing");
    renderPoller("preparing");
    await waitFor(() =>
      expect(screen.getByText(/^Placed /)).toBeInTheDocument(),
    );
  });

  it("hides the placed stamp for a cancelled order", async () => {
    getOrderStatus.mockResolvedValue("cancelled");
    renderPoller("cancelled");
    // Let the mount clock effect run.
    await waitFor(() =>
      expect(screen.getByText("Your order was cancelled")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/^Placed /)).not.toBeInTheDocument();
  });

  it("does not poll once the order is in a terminal state", async () => {
    getOrderStatus.mockResolvedValue("completed");
    renderPoller("completed");

    // Give any stray microtasks a chance to run.
    await Promise.resolve();
    expect(getOrderStatus).not.toHaveBeenCalled();
    expect(screen.getByText("Order complete, enjoy!")).toBeInTheDocument();
  });

  it("offers the alert opt-in, unlocks audio + requests permission on click", async () => {
    getOrderStatus.mockResolvedValue("preparing");
    const user = userEvent.setup();
    renderPoller("preparing");

    const btn = await screen.findByRole("button", {
      name: /Alert me when it's ready/,
    });
    await user.click(btn);

    expect(alerts.unlockAudio).toHaveBeenCalled();
    expect(alerts.requestNotifyPermission).toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByText(/We'll alert you the moment it's ready/),
      ).toBeInTheDocument(),
    );
  });

  it("shows a range-based wait estimate once one is available", async () => {
    getOrderStatus.mockResolvedValue("preparing");
    getWaitEstimate.mockResolvedValue({ seconds: 300, ordersAhead: 2 });
    renderPoller("preparing");

    await waitFor(() =>
      expect(screen.getByText("4-6 min")).toBeInTheDocument(),
    );
  });

  it("falls back to a queue-position label when there isn't enough history for a time estimate", async () => {
    getOrderStatus.mockResolvedValue("preparing");
    getWaitEstimate.mockResolvedValue({ seconds: null, ordersAhead: 2 });
    renderPoller("preparing");

    await waitFor(() =>
      expect(screen.getByText("2 orders ahead of you")).toBeInTheDocument(),
    );
  });

  it("does not show a wait estimate once the order is ready", async () => {
    getOrderStatus.mockResolvedValue("ready");
    getWaitEstimate.mockResolvedValue({ seconds: 300, ordersAhead: 2 });
    renderPoller("preparing");

    await waitFor(() =>
      expect(
        screen.getByText("Your order is ready for pickup!"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("4-6 min")).not.toBeInTheDocument();
  });

  it("still arms (sound-only) where notifications are unsupported", async () => {
    // iOS Safari tab: no Notification API.
    alerts.isNotifySupported.mockReturnValue(false);
    alerts.notifyPermission.mockReturnValue(null);
    getOrderStatus.mockResolvedValue("preparing");
    const user = userEvent.setup();
    renderPoller("preparing");

    const btn = await screen.findByRole("button", {
      name: /Alert me when it's ready/,
    });
    await user.click(btn);

    expect(alerts.unlockAudio).toHaveBeenCalled();
    expect(alerts.requestNotifyPermission).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByText(/keep this tab open/)).toBeInTheDocument(),
    );
  });
});
