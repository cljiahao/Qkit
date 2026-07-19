// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalkupOrderDialog } from "./walkup-order-dialog";

const { getWalkupMenu, placeWalkupOrder } = vi.hoisted(() => ({
  getWalkupMenu: vi.fn(),
  placeWalkupOrder: vi.fn(),
}));

vi.mock("./walkup-menu-actions", () => ({ getWalkupMenu }));
vi.mock("./walkup-actions", () => ({ placeWalkupOrder }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

const BOOTHS = [{ id: "b1", name: "Kopi Corner" }];

beforeEach(() => {
  vi.clearAllMocks();
  getWalkupMenu.mockResolvedValue({
    menuItems: [
      {
        id: "m1",
        name: "Kopi",
        description: "",
        available: true,
        price_cents: 350,
      },
    ],
    remaining: {},
  });
  placeWalkupOrder.mockResolvedValue({
    success: true,
    orderNumber: "0009",
    accessToken: "tok",
  });
});

describe("WalkupOrderDialog", () => {
  it("loads the booth's menu once opened", async () => {
    render(
      <WalkupOrderDialog
        open={true}
        onOpenChange={vi.fn()}
        booths={BOOTHS}
        initialBoothId="b1"
      />,
    );
    expect(getWalkupMenu).toHaveBeenCalledWith("b1");
    expect(await screen.findByText("Kopi")).toBeInTheDocument();
  });

  it("adds a plain item and submits a walk-up order", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <WalkupOrderDialog
        open={true}
        onOpenChange={onOpenChange}
        booths={BOOTHS}
        initialBoothId="b1"
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Add" }));
    await user.click(
      screen.getByRole("button", { name: /add order · 1 item/i }),
    );

    await waitFor(() => expect(placeWalkupOrder).toHaveBeenCalled());
    const [boothId, input] = placeWalkupOrder.mock.calls[0];
    expect(boothId).toBe("b1");
    expect(input.customerName).toBe("Walk-up");
    expect(input.items).toEqual([
      { menuItemId: "m1", name: "Kopi", price_cents: 350, quantity: 1 },
    ]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows a no-booths state instead of fetching a menu", () => {
    render(
      <WalkupOrderDialog open={true} onOpenChange={vi.fn()} booths={[]} />,
    );
    expect(
      screen.getByText(/no open booths to take a walk-up order for/i),
    ).toBeInTheDocument();
    expect(getWalkupMenu).not.toHaveBeenCalled();
  });

  it("disables submit with an empty cart", async () => {
    render(
      <WalkupOrderDialog
        open={true}
        onOpenChange={vi.fn()}
        booths={BOOTHS}
        initialBoothId="b1"
      />,
    );
    await screen.findByText("Kopi");
    expect(
      screen.getByRole("button", { name: /add items to order/i }),
    ).toBeDisabled();
  });
});
