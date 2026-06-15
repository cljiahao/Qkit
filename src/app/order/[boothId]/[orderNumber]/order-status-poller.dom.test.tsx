// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderStatusPoller } from "./order-status-poller";
import type { OrderStatus } from "@/lib/types";

const { getOrderStatus, alerts } = vi.hoisted(() => ({
  getOrderStatus: vi.fn(),
  alerts: {
    isNotifySupported: vi.fn(() => true),
    notifyPermission: vi.fn(() => "default" as NotificationPermission),
    requestNotifyPermission: vi.fn(
      async () => "granted" as NotificationPermission,
    ),
    fireReadyNotification: vi.fn(),
    playReadyChime: vi.fn(() => true),
  },
}));

vi.mock("./status-actions", () => ({ getOrderStatus }));
vi.mock("@/lib/order-alerts", () => alerts);

function renderPoller(initialStatus: OrderStatus = "preparing") {
  return render(
    <OrderStatusPoller
      boothId="b1"
      orderNumber="0007"
      initialStatus={initialStatus}
      boothName="Kopi Cart"
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  alerts.isNotifySupported.mockReturnValue(true);
  alerts.notifyPermission.mockReturnValue("default");
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
    expect(getOrderStatus).toHaveBeenCalledWith("b1", "0007");
  });

  it("alerts the customer when the order becomes ready", async () => {
    getOrderStatus.mockResolvedValue("ready");
    renderPoller("preparing");

    await waitFor(() =>
      expect(alerts.fireReadyNotification).toHaveBeenCalledWith(
        "Kopi Cart",
        "0007",
      ),
    );
    // Tab is visible in jsdom, so it chimes immediately.
    expect(alerts.playReadyChime).toHaveBeenCalled();
  });

  it("does not poll once the order is in a terminal state", async () => {
    getOrderStatus.mockResolvedValue("completed");
    renderPoller("completed");

    // Give any stray microtasks a chance to run.
    await Promise.resolve();
    expect(getOrderStatus).not.toHaveBeenCalled();
    expect(screen.getByText("Order complete — enjoy!")).toBeInTheDocument();
  });

  it("offers the notify opt-in and requests permission on click", async () => {
    getOrderStatus.mockResolvedValue("preparing");
    const user = userEvent.setup();
    renderPoller("preparing");

    const btn = await screen.findByRole("button", {
      name: /Notify me when it's ready/,
    });
    await user.click(btn);

    expect(alerts.requestNotifyPermission).toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByText(/We'll alert you the moment it's ready/),
      ).toBeInTheDocument(),
    );
  });
});
