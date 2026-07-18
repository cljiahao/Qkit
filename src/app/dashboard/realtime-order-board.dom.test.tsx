// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RealtimeOrderBoard } from "./realtime-order-board";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DEFAULT_BOARD_SETTINGS } from "@/lib/types";
import type { BoardOrder } from "@/lib/types";

function order(overrides: Partial<BoardOrder> = {}): BoardOrder {
  return {
    id: overrides.id ?? "o1",
    booth_id: overrides.booth_id ?? "b1",
    order_number: overrides.order_number ?? "0001",
    customer_name: overrides.customer_name ?? "Priya",
    items: [{ menuItemId: "m1", name: "Flat White", quantity: 1 }],
    status: "preparing",
    total_cents: 550,
    payment_status: "not_required",
    payment_method_kind: null,
    paid_at: null,
    created_at: "2026-06-12T04:00:00Z",
    ready_at: null,
    completed_at: null,
    updated_at: "2026-06-12T04:00:00Z",
    idempotency_key: null,
    priority_bumped_at: null,
    ...overrides,
  };
}

// The board renders via useRealtimeOrders, which opens a Supabase realtime
// channel — stub it out to a no-op so the hook just echoes initialOrders.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        in: () => ({
          not: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
    channel: () => ({
      on: () => ({
        on: () => ({ subscribe: () => ({}) }),
        subscribe: () => ({}),
      }),
      subscribe: () => ({}),
    }),
    removeChannel: () => {},
  }),
}));

vi.mock("sonner", () => ({ toast: vi.fn() }));

const BOOTHS = [{ id: "b1", name: "Kopi Corner", is_active: true, open: true }];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RealtimeOrderBoard sort toggle", () => {
  it("defaults to earliest-first and re-sorts to latest-first on click", async () => {
    const user = userEvent.setup();
    const orders = [
      order({
        id: "old",
        order_number: "0001",
        created_at: "2026-06-12T04:00:00Z",
      }),
      order({
        id: "new",
        order_number: "0002",
        created_at: "2026-06-12T04:05:00Z",
      }),
    ];
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={orders}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    const numbersInOrder = () =>
      screen.getAllByText(/^#000[12]$/).map((el) => el.textContent);

    expect(numbersInOrder()).toEqual(["#0001", "#0002"]);

    await user.click(screen.getByRole("button", { name: "Latest first" }));

    expect(numbersInOrder()).toEqual(["#0002", "#0001"]);
  });
});
