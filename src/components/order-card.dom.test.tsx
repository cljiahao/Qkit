// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderCard } from "./order-card";
import type { Order } from "@/lib/types";

// Capture the supabase update chain so we can assert what status was written.
const { updateMock, eqMock } = vi.hoisted(() => {
  const eqMock = vi.fn(() => Promise.resolve({ error: null }));
  const updateMock = vi.fn(() => ({ eq: eqMock }));
  return { updateMock, eqMock };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => ({ update: updateMock }) }),
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
    ...overrides,
  };
}

beforeEach(() => {
  updateMock.mockClear();
  eqMock.mockClear();
});

describe("OrderCard", () => {
  it("renders order number, customer, items and total", () => {
    render(<OrderCard order={makeOrder()} />);
    expect(screen.getByText("#0007")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText(/Kopi/)).toBeInTheDocument();
    // Line total (350×2) and order total both read $7.00.
    expect(screen.getAllByText("$7.00")).toHaveLength(2);
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("advances preparing -> ready and relabels the button", async () => {
    const user = userEvent.setup();
    render(<OrderCard order={makeOrder({ status: "preparing" })} />);

    await user.click(screen.getByRole("button", { name: "Mark Ready" }));

    // Advancing to ready stamps ready_at (drives the wait-time stats).
    expect(updateMock).toHaveBeenCalledWith({
      status: "ready",
      ready_at: expect.any(String),
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Mark Picked Up" }),
      ).toBeInTheDocument(),
    );
  });

  it("advances ready -> completed and stamps completed_at", async () => {
    const user = userEvent.setup();
    render(<OrderCard order={makeOrder({ status: "ready" })} />);

    await user.click(screen.getByRole("button", { name: "Mark Picked Up" }));

    expect(updateMock).toHaveBeenCalledWith({
      status: "completed",
      completed_at: expect.any(String),
    });
  });

  it("cancels via the confirm dialog", async () => {
    const user = userEvent.setup();
    render(<OrderCard order={makeOrder({ status: "preparing" })} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    // Dialog action (distinct from the trigger / "Keep order").
    await user.click(screen.getByRole("button", { name: "Cancel order" }));

    expect(updateMock).toHaveBeenCalledWith({ status: "cancelled" });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Mark Ready" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows no action buttons for a completed order", () => {
    render(<OrderCard order={makeOrder({ status: "completed" })} />);
    expect(
      screen.queryByRole("button", { name: /Mark/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  it("renders the booth pill when a name is given", () => {
    render(<OrderCard order={makeOrder()} boothName="Kopi Cart" />);
    expect(screen.getByText("Kopi Cart")).toBeInTheDocument();
  });
});

describe("OrderCard payment", () => {
  it("shows a Confirm payment button for a claimed order", () => {
    render(<OrderCard order={makeOrder({ payment_status: "claimed" })} />);
    expect(
      screen.getByRole("button", { name: /confirm payment/i }),
    ).toBeInTheDocument();
  });

  it("confirms payment, stamping paid_at", async () => {
    const user = userEvent.setup();
    render(<OrderCard order={makeOrder({ payment_status: "claimed" })} />);
    await user.click(screen.getByRole("button", { name: /confirm payment/i }));
    expect(updateMock).toHaveBeenCalledWith({
      payment_status: "confirmed",
      paid_at: expect.any(String),
    });
  });

  it("shows a Paid badge for a confirmed order", () => {
    render(<OrderCard order={makeOrder({ payment_status: "confirmed" })} />);
    expect(screen.getByText(/^Paid$/i)).toBeInTheDocument();
  });

  it("shows no payment UI when payment is not required", () => {
    render(<OrderCard order={makeOrder({ payment_status: "not_required" })} />);
    expect(
      screen.queryByRole("button", { name: /confirm payment/i }),
    ).not.toBeInTheDocument();
  });
});
