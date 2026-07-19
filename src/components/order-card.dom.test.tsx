// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderCard } from "./order-card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { sgtClock, shortDateTime } from "@/lib/tz";
import type { Order } from "@/lib/types";

// The card delegates mutations to server actions (order-actions.ts). We mock
// those and assert the card calls the right one with the order id; the patch
// content is the server action's job (covered in order-actions.test.ts).
const {
  advanceOrder,
  confirmOrderPayment,
  cancelOrder,
  bumpOrder,
  revertOrderAdvance,
} = vi.hoisted(() => ({
  advanceOrder: vi.fn(),
  confirmOrderPayment: vi.fn(),
  cancelOrder: vi.fn(),
  bumpOrder: vi.fn(),
  revertOrderAdvance: vi.fn(),
}));

vi.mock("@/app/dashboard/order-actions", () => ({
  advanceOrder,
  confirmOrderPayment,
  cancelOrder,
  bumpOrder,
  revertOrderAdvance,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    booth_id: "b1",
    order_number: "0007",
    customer_name: "Ada",
    items: [{ menuItemId: "m1", name: "Kopi", price_cents: 350, quantity: 2 }],
    status: "preparing",
    total_cents: 700,
    payment_status: "not_required",
    payment_method_kind: null,
    paid_at: null,
    created_at: new Date(0).toISOString(),
    ready_at: null,
    completed_at: null,
    updated_at: new Date(0).toISOString(),
    idempotency_key: null,
    access_token: "tok-test",
    priority_bumped_at: null,
    source: "qr",
    ...overrides,
  };
}

beforeEach(() => {
  advanceOrder.mockReset();
  confirmOrderPayment.mockReset();
  cancelOrder.mockReset();
  bumpOrder.mockReset();
  revertOrderAdvance.mockReset();
  advanceOrder.mockResolvedValue({ success: true, status: "ready" });
  confirmOrderPayment.mockResolvedValue({ success: true });
  cancelOrder.mockResolvedValue({ success: true });
  bumpOrder.mockResolvedValue({ success: true });
  revertOrderAdvance.mockResolvedValue({ success: true, status: "preparing" });
});

describe("OrderCard", () => {
  it("renders order number, customer, items and total", () => {
    render(<OrderCard order={makeOrder()} />, { wrapper: TooltipProvider });
    expect(screen.getByText("#0007")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText(/Kopi/)).toBeInTheDocument();
    // Line total (350×2) and order total both read $7.00.
    expect(screen.getAllByText("$7.00")).toHaveLength(2);
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("footer stamp is a bare time by default, a date+time when showDate is set", () => {
    const order = makeOrder();
    const { rerender } = render(<OrderCard order={order} />, {
      wrapper: TooltipProvider,
    });
    expect(screen.getByText(sgtClock(order.created_at))).toBeInTheDocument();
    expect(
      screen.queryByText(shortDateTime(order.created_at)),
    ).not.toBeInTheDocument();

    rerender(
      <TooltipProvider>
        <OrderCard order={order} showDate />
      </TooltipProvider>,
    );
    expect(
      screen.getByText(shortDateTime(order.created_at)),
    ).toBeInTheDocument();
  });

  it("shows Free (not $0.00) for an unpriced item in an otherwise-priced order", () => {
    render(
      <OrderCard
        order={makeOrder({
          items: [
            { menuItemId: "m1", name: "Kopi", price_cents: 350, quantity: 1 },
            { menuItemId: "m2", name: "Extra sauce", quantity: 1 },
          ],
          total_cents: 350,
        })}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("advances preparing -> ready instantly, showing Undo rather than a confirm gate", async () => {
    const user = userEvent.setup();
    advanceOrder.mockResolvedValue({ success: true, status: "ready" });
    render(<OrderCard order={makeOrder({ status: "preparing" })} />, {
      wrapper: TooltipProvider,
    });

    await user.click(screen.getByRole("button", { name: "Mark Ready" }));

    // No confirmation dialog — the tap already happened. Recovery is Undo.
    expect(advanceOrder).toHaveBeenCalledWith("o1");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Mark Picked Up" }),
    ).not.toBeInTheDocument();
  });

  it("undoes an advance back to the previous status", async () => {
    const user = userEvent.setup();
    advanceOrder.mockResolvedValue({ success: true, status: "ready" });
    render(<OrderCard order={makeOrder({ status: "preparing" })} />, {
      wrapper: TooltipProvider,
    });

    await user.click(screen.getByRole("button", { name: "Mark Ready" }));
    await user.click(await screen.findByRole("button", { name: /undo/i }));

    expect(revertOrderAdvance).toHaveBeenCalledWith(
      "o1",
      "preparing",
      "ready",
      "not_required",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Mark Ready" }),
      ).toBeInTheDocument(),
    );
  });

  it("reveals the next advance label once the undo window elapses", async () => {
    const user = userEvent.setup();
    advanceOrder.mockResolvedValue({ success: true, status: "ready" });
    render(<OrderCard order={makeOrder({ status: "preparing" })} />, {
      wrapper: TooltipProvider,
    });

    await user.click(screen.getByRole("button", { name: "Mark Ready" }));
    await screen.findByRole("button", { name: /undo/i });

    // Real-time wait past UNDO_MS (4s) — deliberately not faked: mixing fake
    // timers with userEvent's own internal delays and RTL's polling wait is
    // fragile enough to cost more confidence than it saves for one test.
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: "Mark Picked Up" }),
        ).toBeInTheDocument(),
      { timeout: 5000 },
    );
  }, 6000);

  it("advances ready -> completed via the action", async () => {
    const user = userEvent.setup();
    advanceOrder.mockResolvedValue({ success: true, status: "completed" });
    render(<OrderCard order={makeOrder({ status: "ready" })} />, {
      wrapper: TooltipProvider,
    });

    await user.click(screen.getByRole("button", { name: "Mark Picked Up" }));

    expect(advanceOrder).toHaveBeenCalledWith("o1");
  });

  it("does not flash a Paid badge when completing an order that never required payment", async () => {
    const user = userEvent.setup();
    advanceOrder.mockResolvedValue({ success: true, status: "completed" });
    render(
      <OrderCard
        order={makeOrder({ status: "ready", payment_status: "not_required" })}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(screen.getByRole("button", { name: "Mark Picked Up" }));

    expect(screen.queryByText(/^Paid$/i)).not.toBeInTheDocument();
  });

  it("cancels via the confirm dialog", async () => {
    const user = userEvent.setup();
    render(<OrderCard order={makeOrder({ status: "preparing" })} />, {
      wrapper: TooltipProvider,
    });

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    // Dialog action (distinct from the trigger / "Keep order").
    await user.click(screen.getByRole("button", { name: "Cancel order" }));

    expect(cancelOrder).toHaveBeenCalledWith("o1");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Mark Ready" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows no action buttons for a completed order", () => {
    render(<OrderCard order={makeOrder({ status: "completed" })} />, {
      wrapper: TooltipProvider,
    });
    expect(
      screen.queryByRole("button", { name: /Mark/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  it("renders the booth banner when a name is given", () => {
    render(<OrderCard order={makeOrder()} boothName="Kopi Cart" />, {
      wrapper: TooltipProvider,
    });
    expect(screen.getByText("Kopi Cart")).toBeInTheDocument();
  });
});

describe("OrderCard payment", () => {
  it("shows a Confirm payment button for a claimed order", () => {
    render(<OrderCard order={makeOrder({ payment_status: "claimed" })} />, {
      wrapper: TooltipProvider,
    });
    expect(
      screen.getByRole("button", { name: /confirm payment/i }),
    ).toBeInTheDocument();
  });

  it("confirms payment via the action", async () => {
    const user = userEvent.setup();
    render(<OrderCard order={makeOrder({ payment_status: "claimed" })} />, {
      wrapper: TooltipProvider,
    });
    await user.click(screen.getByRole("button", { name: /confirm payment/i }));
    expect(confirmOrderPayment).toHaveBeenCalledWith("o1");
  });

  it("shows a Paid badge for a confirmed order", () => {
    render(<OrderCard order={makeOrder({ payment_status: "confirmed" })} />, {
      wrapper: TooltipProvider,
    });
    expect(screen.getByText(/^Paid$/i)).toBeInTheDocument();
  });

  it("shows no payment UI when payment is not required", () => {
    render(
      <OrderCard order={makeOrder({ payment_status: "not_required" })} />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.queryByRole("button", { name: /confirm payment/i }),
    ).not.toBeInTheDocument();
  });

  it("hides the Cancel button for a paid (confirmed) live order", () => {
    render(
      <OrderCard
        order={makeOrder({ status: "preparing", payment_status: "confirmed" })}
      />,
      { wrapper: TooltipProvider },
    );
    // No refund rail — a paid order shows no cancel affordance, but stays live.
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mark Ready" }),
    ).toBeInTheDocument();
  });

  it("still shows Cancel for a non-paid live order", () => {
    render(
      <OrderCard
        order={makeOrder({ status: "preparing", payment_status: "pending" })}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("makes the name/number block a bump-confirmation trigger for a live, non-bumped order", () => {
    render(<OrderCard order={makeOrder({ priority_bumped_at: null })} />, {
      wrapper: TooltipProvider,
    });
    expect(screen.getByRole("button", { name: /Ada/ })).toBeInTheDocument();
  });

  it("calls bumpOrder after confirmation and swaps the trigger for a bumped icon", async () => {
    const user = userEvent.setup();
    render(<OrderCard order={makeOrder({ priority_bumped_at: null })} />, {
      wrapper: TooltipProvider,
    });
    await user.click(screen.getByRole("button", { name: /Ada/ }));
    await user.click(screen.getByRole("button", { name: "Bump to front" }));
    expect(bumpOrder).toHaveBeenCalledWith("o1");
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Ada/ }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByLabelText(/manually bumped to the front/i),
    ).toBeInTheDocument();
  });

  it("shows the bumped icon and no confirmation trigger for an order already bumped", () => {
    render(
      <OrderCard
        order={makeOrder({ priority_bumped_at: new Date(0).toISOString() })}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Ada/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(/manually bumped to the front/i),
    ).toBeInTheDocument();
  });

  it("shows no bump trigger or bumped icon for a closed order", () => {
    render(
      <OrderCard
        order={makeOrder({ status: "completed", priority_bumped_at: null })}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Ada/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/manually bumped to the front/i),
    ).not.toBeInTheDocument();
  });
});
