// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueueDisplay } from "./queue-display";
import type { QueueDisplayOrder } from "./actions";

const { getBoothQueueDisplay, alerts } = vi.hoisted(() => ({
  getBoothQueueDisplay: vi.fn(),
  alerts: {
    playReadyChime: vi.fn(async () => true),
    unlockAudio: vi.fn(),
  },
}));

vi.mock("./actions", async () => {
  const actual = await vi.importActual<typeof import("./actions")>("./actions");
  return { ...actual, getBoothQueueDisplay };
});
vi.mock("@/lib/order-alerts", () => alerts);

function renderDisplay(initialOrders: QueueDisplayOrder[]) {
  return render(
    <QueueDisplay
      boothId="b1"
      boothName="Kopi Cart"
      initialOrders={initialOrders}
    />,
  );
}

const PREPARING: QueueDisplayOrder = {
  orderNumber: "0001",
  displayNumber: "001",
  status: "preparing",
};
const READY: QueueDisplayOrder = {
  orderNumber: "0002",
  displayNumber: "002",
  status: "ready",
};

beforeEach(() => {
  vi.clearAllMocks();
  getBoothQueueDisplay.mockResolvedValue([]);
});

describe("QueueDisplay", () => {
  it("groups orders into Preparing and Ready for pickup", () => {
    renderDisplay([PREPARING, READY]);

    const preparing = screen.getByText("Preparing").closest("section")!;
    const ready = screen.getByText("Ready for pickup").closest("section")!;
    expect(preparing).toHaveTextContent("001");
    expect(ready).toHaveTextContent("002");
  });

  it("shows an empty-state line for each group with nothing in it", () => {
    renderDisplay([]);

    expect(screen.getByText("No orders in progress")).toBeInTheDocument();
    expect(screen.getByText("Nothing ready yet")).toBeInTheDocument();
  });

  it("polls on mount and reflects updated order data", async () => {
    getBoothQueueDisplay.mockResolvedValue([
      { ...PREPARING, displayNumber: "001" },
    ]);
    renderDisplay([]);

    await waitFor(() =>
      expect(getBoothQueueDisplay).toHaveBeenCalledWith("b1"),
    );
    await waitFor(() =>
      expect(
        screen.getByText("Preparing").closest("section"),
      ).toHaveTextContent("001"),
    );
  });

  it("flashes a tile the moment it transitions to ready, silently by default", async () => {
    getBoothQueueDisplay.mockResolvedValue([{ ...PREPARING, status: "ready" }]);
    renderDisplay([PREPARING]);

    await waitFor(() => {
      const tile = screen.getByText("001");
      expect(tile).toHaveClass("queue-flash");
    });
    expect(alerts.playReadyChime).not.toHaveBeenCalled();
  });

  it("does not flash an order that was already ready before the page loaded", async () => {
    getBoothQueueDisplay.mockResolvedValue([READY]);
    renderDisplay([READY]);

    await waitFor(() => expect(getBoothQueueDisplay).toHaveBeenCalled());
    expect(screen.getByText("002")).not.toHaveClass("queue-flash");
  });

  it("unlocks audio and hides its own button once sound is enabled", async () => {
    const user = userEvent.setup();
    renderDisplay([]);

    await user.click(screen.getByRole("button", { name: /Enable sound/ }));

    expect(alerts.unlockAudio).toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /Enable sound/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps showing the last good state on a transient poll failure", async () => {
    getBoothQueueDisplay.mockResolvedValue(null);
    renderDisplay([PREPARING]);

    await waitFor(() => expect(getBoothQueueDisplay).toHaveBeenCalled());
    expect(screen.getByText("001")).toBeInTheDocument();
  });

  it("caps how many preparing tiles it renders, no scrolling on a TV screen", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      orderNumber: String(i + 1).padStart(4, "0"),
      displayNumber: String(i + 1).padStart(3, "0"),
      status: "preparing" as const,
    }));
    renderDisplay(many);

    const section = screen.getByText("Preparing").closest("section")!;
    expect(section.querySelectorAll('[class*="size-24"]')).toHaveLength(12);
    expect(section).toHaveTextContent("+3 more preparing");
  });

  it("caps how many ready tiles it renders", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      orderNumber: String(i + 1).padStart(4, "0"),
      displayNumber: String(i + 1).padStart(3, "0"),
      status: "ready" as const,
    }));
    renderDisplay(many);

    const section = screen.getByText("Ready for pickup").closest("section")!;
    expect(section.querySelectorAll('[class*="size-32"]')).toHaveLength(8);
    expect(section).toHaveTextContent("+2 more ready");
  });

  it("never caps out a currently-flashing tile, even past the ready limit", async () => {
    const stale = Array.from({ length: 8 }, (_, i) => ({
      orderNumber: `stale-${i}`,
      displayNumber: String(i + 101).padStart(3, "0"),
      status: "ready" as const,
    }));
    getBoothQueueDisplay.mockResolvedValue([
      ...stale,
      { ...PREPARING, status: "ready" },
    ]);
    renderDisplay(stale);

    await waitFor(() => {
      const section = screen.getByText("Ready for pickup").closest("section")!;
      expect(within(section).getByText("001")).toHaveClass("queue-flash");
    });
  });
});
