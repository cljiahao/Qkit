// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompletedOrdersList } from "./completed-orders-list";
import type { BoardOrder } from "@/lib/types";

vi.mock("@/app/dashboard/order-actions", () => ({
  advanceOrder: vi.fn(),
  confirmOrderPayment: vi.fn(),
  cancelOrder: vi.fn(),
  bumpOrder: vi.fn(),
  revertOrderAdvance: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function makeOrder(overrides: Partial<BoardOrder> = {}): BoardOrder {
  return {
    id: `o-${Math.random()}`,
    booth_id: "b1",
    order_number: "0007",
    customer_name: "Ada",
    items: [{ menuItemId: "m1", name: "Kopi", price_cents: 350, quantity: 2 }],
    status: "completed",
    total_cents: 700,
    payment_status: "not_required",
    payment_method_kind: null,
    paid_at: null,
    created_at: new Date(0).toISOString(),
    ready_at: new Date(0).toISOString(),
    completed_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    idempotency_key: null,
    priority_bumped_at: null,
    ...overrides,
  };
}

const BOOTHS = [{ id: "b1", name: "Kopi Corner" }];

describe("CompletedOrdersList", () => {
  it("shows an empty state when there are no completed orders", () => {
    render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={[]}
        loadError={false}
        historyLimit={500}
      />,
    );
    expect(screen.getByText("No completed orders yet")).toBeInTheDocument();
  });

  it("shows a retry banner on a load error instead of an empty state", () => {
    render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={[]}
        loadError={true}
        historyLimit={500}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load your completed orders",
    );
  });

  it("renders a card per completed order", () => {
    const orders = [
      makeOrder({ id: "o1", order_number: "0001" }),
      makeOrder({ id: "o2", order_number: "0002" }),
    ];
    render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={orders}
        loadError={false}
        historyLimit={500}
      />,
    );
    expect(screen.getByText("#0001")).toBeInTheDocument();
    expect(screen.getByText("#0002")).toBeInTheDocument();
  });

  it("only shows a booth banner when the vendor has more than one booth", () => {
    const order = makeOrder({ id: "o1" });
    const { rerender } = render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={[order]}
        loadError={false}
        historyLimit={500}
      />,
    );
    expect(screen.queryByText("Kopi Corner")).not.toBeInTheDocument();

    rerender(
      <CompletedOrdersList
        booths={[...BOOTHS, { id: "b2", name: "Ice Cream Cart" }]}
        orders={[order]}
        loadError={false}
        historyLimit={500}
      />,
    );
    expect(screen.getByText("Kopi Corner")).toBeInTheDocument();
  });

  it("paginates beyond the first page", async () => {
    const user = userEvent.setup();
    const orders = Array.from({ length: 13 }, (_, i) =>
      makeOrder({ id: `o${i}`, order_number: String(i).padStart(4, "0") }),
    );
    render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={orders}
        loadError={false}
        historyLimit={500}
      />,
    );
    // Default pageSize is 12 — the 13th order starts on page 2.
    expect(screen.queryByText("#0012")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("#0012")).toBeInTheDocument();
  });

  it("notes the history cap when the fetch hit historyLimit", () => {
    const orders = [makeOrder({ id: "o1" })];
    render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={orders}
        loadError={false}
        historyLimit={1}
      />,
    );
    expect(
      screen.getByText(/most recent 1 completed orders/),
    ).toBeInTheDocument();
  });

  it("shows the x-y of N count even when everything fits on one page", () => {
    render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={[makeOrder({ id: "o1" })]}
        loadError={false}
        historyLimit={500}
      />,
    );
    expect(screen.getByText("1–1 of 1")).toBeInTheDocument();
  });

  it("filters by booth via the dropdown", async () => {
    const user = userEvent.setup();
    const orders = [
      makeOrder({ id: "o1", order_number: "0001", booth_id: "b1" }),
      makeOrder({ id: "o2", order_number: "0002", booth_id: "b2" }),
    ];
    render(
      <CompletedOrdersList
        booths={[...BOOTHS, { id: "b2", name: "Ice Cream Cart" }]}
        orders={orders}
        loadError={false}
        historyLimit={500}
      />,
    );
    expect(screen.getByText("#0001")).toBeInTheDocument();
    expect(screen.getByText("#0002")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Kopi Corner" }));

    expect(screen.getByText("#0001")).toBeInTheDocument();
    expect(screen.queryByText("#0002")).not.toBeInTheDocument();
  });

  it("filters by search text matching order number or customer name", async () => {
    const user = userEvent.setup();
    const orders = [
      makeOrder({ id: "o1", order_number: "0001", customer_name: "Ada" }),
      makeOrder({ id: "o2", order_number: "0002", customer_name: "Priya" }),
    ];
    render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={orders}
        loadError={false}
        historyLimit={500}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Search order # or customer name"),
      "priya",
    );

    expect(screen.queryByText("#0001")).not.toBeInTheDocument();
    expect(screen.getByText("#0002")).toBeInTheDocument();
  });

  it("filters by date range", async () => {
    const user = userEvent.setup();
    const now = Date.now();
    const orders = [
      makeOrder({
        id: "recent",
        order_number: "0001",
        completed_at: new Date(now - 60_000).toISOString(), // 1 min ago
      }),
      makeOrder({
        id: "old",
        order_number: "0002",
        completed_at: new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString(), // 40 days ago
      }),
    ];
    render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={orders}
        loadError={false}
        historyLimit={500}
      />,
    );
    expect(screen.getByText("#0001")).toBeInTheDocument();
    expect(screen.getByText("#0002")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "7 days" }));

    expect(screen.getByText("#0001")).toBeInTheDocument();
    expect(screen.queryByText("#0002")).not.toBeInTheDocument();
  });

  it("shows a no-match state when the search matches nothing", async () => {
    const user = userEvent.setup();
    render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={[makeOrder({ id: "o1" })]}
        loadError={false}
        historyLimit={500}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Search order # or customer name"),
      "nobody",
    );

    expect(screen.getByText("No matching orders")).toBeInTheDocument();
  });
});
