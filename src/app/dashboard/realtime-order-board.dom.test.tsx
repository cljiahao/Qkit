// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RealtimeOrderBoard } from "./realtime-order-board";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toggleBoothActive } from "./booths/actions";
import { getWalkupMenu } from "./walkup-menu-actions";
import { advanceOrder } from "./order-actions";
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
    print_status: "not_required",
    print_status_updated_at: null,
    created_at: "2026-06-12T04:00:00Z",
    ready_at: null,
    completed_at: null,
    updated_at: "2026-06-12T04:00:00Z",
    idempotency_key: null,
    priority_bumped_at: null,
    source: "qr",
    auto_completed: false,
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

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./booths/actions", () => ({ toggleBoothActive: vi.fn() }));
vi.mock("./walkup-menu-actions", () => ({ getWalkupMenu: vi.fn() }));
vi.mock("./walkup-actions", () => ({ placeWalkupOrder: vi.fn() }));
vi.mock("./order-actions", () => ({
  sweepReadyOrders: vi.fn(),
  advanceOrder: vi.fn(),
}));

const BOOTHS = [{ id: "b1", name: "Kopi Corner", is_active: true, open: true }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(toggleBoothActive).mockResolvedValue({ success: true });
  vi.mocked(advanceOrder).mockResolvedValue({ success: true, status: "ready" });
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

    await user.click(screen.getByRole("button", { name: "Latest" }));

    expect(numbersInOrder()).toEqual(["#0002", "#0001"]);
  });
});

describe("RealtimeOrderBoard daily order-number reset", () => {
  it("shows the real order_number when no baseline is supplied", () => {
    // The component itself only reacts to dailyOrderNumberBaselines being
    // populated — whether to fetch/pass one at all is decided server-side
    // (page.tsx) from boardSettings.daily_order_number_reset, so this covers
    // "no baseline" regardless of that flag's value.
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[order({ order_number: "0847" })]}
        boardSettings={{
          ...DEFAULT_BOARD_SETTINGS,
          daily_order_number_reset: false,
        }}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByText("#0847")).toBeInTheDocument();
  });

  it("shows the daily-reset display number when a baseline is supplied", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[order({ order_number: "0847" })]}
        boardSettings={{
          ...DEFAULT_BOARD_SETTINGS,
          daily_order_number_reset: true,
        }}
        dailyOrderNumberBaselines={{ b1: "0845" }}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByText("#003")).toBeInTheDocument();
    expect(screen.queryByText("#0847")).not.toBeInTheDocument();
  });
});

describe("RealtimeOrderBoard booth active toggle", () => {
  it("shows a single booth's open/pause toggle inline, no modal needed", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByRole("button", {
        name: "Kopi Corner is open. Tap to pause.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /booth status/i }),
    ).not.toBeInTheDocument();
  });

  it("gates 2+ booths behind a 'Booths' dialog, reflecting each is_active state", async () => {
    const user = userEvent.setup();
    const booths = [
      { id: "b1", name: "Kopi Corner", is_active: true, open: true },
      { id: "b2", name: "Ice Cream Cart", is_active: false, open: false },
    ];
    render(
      <RealtimeOrderBoard
        booths={booths}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.queryByRole("button", { name: /Kopi Corner is/ }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Booth status, 1 of 2 open" }),
    );

    expect(
      screen.getByRole("button", {
        name: "Kopi Corner is open. Tap to pause.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Ice Cream Cart is paused. Tap to resume.",
      }),
    ).toBeInTheDocument();
  });

  it("stays reachable for a paused booth with no active orders", async () => {
    // visibleBooths (the filter dropdown's source) drops an inactive booth
    // with nothing in flight — the dialog's list must not, or there'd be no
    // way to turn it back on.
    const user = userEvent.setup();
    const booths = [
      { id: "b1", name: "Kopi Corner", is_active: true, open: true },
      { id: "b2", name: "Ice Cream Cart", is_active: false, open: false },
    ];
    render(
      <RealtimeOrderBoard
        booths={booths}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    await user.click(
      screen.getByRole("button", { name: "Booth status, 1 of 2 open" }),
    );
    expect(
      screen.getByRole("button", {
        name: "Ice Cream Cart is paused. Tap to resume.",
      }),
    ).toBeInTheDocument();
  });

  it("toggles instantly and calls toggleBoothActive", async () => {
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(
      screen.getByRole("button", {
        name: "Kopi Corner is open. Tap to pause.",
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "Kopi Corner is paused. Tap to resume.",
      }),
    ).toBeInTheDocument();
    expect(toggleBoothActive).toHaveBeenCalledWith("b1", false);
  });

  it("reverts the toggle when it fails", async () => {
    vi.mocked(toggleBoothActive).mockResolvedValue({
      success: false,
      error: "Could not update booth",
    });
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(
      screen.getByRole("button", {
        name: "Kopi Corner is open. Tap to pause.",
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Kopi Corner is open. Tap to pause.",
        }),
      ).toBeInTheDocument(),
    );
  });

  it("keeps the filter dropdown and header toggle after pausing the booth you're filtered to, even with nothing in flight", async () => {
    // Regression: visibleBooths used to drop a paused-and-empty booth
    // unconditionally, including the one the vendor had the board filtered
    // to — which collapsed multiBooth to false on the same render and
    // yanked the Select + the header's own toggle out from under the tap
    // that had just paused it.
    const user = userEvent.setup();
    const booths = [
      { id: "b1", name: "Kopi Corner", is_active: true, open: true },
      { id: "b2", name: "Ice Cream Cart", is_active: true, open: true },
    ];
    render(
      <RealtimeOrderBoard
        booths={booths}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: /Ice Cream Cart/ }));

    await user.click(
      screen.getByRole("button", {
        name: "Ice Cream Cart is open. Tap to pause.",
      }),
    );

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Ice Cream Cart is paused. Tap to resume.",
      }),
    ).toBeInTheDocument();
  });
});

describe("RealtimeOrderBoard walk-up order button", () => {
  it("opens the walk-up dialog for the sole active booth", async () => {
    vi.mocked(getWalkupMenu).mockResolvedValue({
      menuItems: [],
      remaining: {},
      expectsPayment: false,
      paymentKind: null,
    });
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(screen.getByRole("button", { name: /new order/i }));

    expect(screen.getByText("New walk-up order")).toBeInTheDocument();
    await waitFor(() => expect(getWalkupMenu).toHaveBeenCalledWith("b1"));
  });

  it("does not offer a paused booth as a walk-up target", async () => {
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={[
          { id: "b1", name: "Kopi Corner", is_active: false, open: false },
        ]}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(screen.getByRole("button", { name: /new order/i }));

    expect(
      screen.getByText(/no open booths to take a walk-up order for/i),
    ).toBeInTheDocument();
    // No active booth to preselect — getWalkupMenu never fires.
    expect(getWalkupMenu).not.toHaveBeenCalled();
  });
});

describe("RealtimeOrderBoard event-mode (walkup_default)", () => {
  it("auto-opens the walk-up dialog on load when the sole booth defaults to it", async () => {
    vi.mocked(getWalkupMenu).mockResolvedValue({
      menuItems: [],
      remaining: {},
      expectsPayment: false,
      paymentKind: null,
    });
    render(
      <RealtimeOrderBoard
        booths={[
          {
            id: "b1",
            name: "Kopi Corner",
            is_active: true,
            open: true,
            walkup_default: true,
          },
        ]}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    expect(await screen.findByText("New walk-up order")).toBeInTheDocument();
    await waitFor(() => expect(getWalkupMenu).toHaveBeenCalledWith("b1"));
  });

  it("does not auto-open the walk-up dialog for an ordinary QR booth", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.queryByText("New walk-up order")).not.toBeInTheDocument();
    expect(getWalkupMenu).not.toHaveBeenCalled();
  });

  it("offers a 'Set up for an event' entry point alongside 'Add your first booth' when a vendor has no booths yet", () => {
    render(
      <RealtimeOrderBoard
        booths={[]}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByRole("link", { name: /add your first booth/i }),
    ).toHaveAttribute("href", "/dashboard/booths/new");
    expect(
      screen.getByRole("link", { name: /set up for an event/i }),
    ).toHaveAttribute("href", "/dashboard/booths/new?mode=event");
  });
});

describe("RealtimeOrderBoard batch mark-ready", () => {
  it("has no Select control when no order is preparing", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[order({ id: "o1", status: "ready" })]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.queryByRole("button", { name: /select/i }),
    ).not.toBeInTheDocument();
  });

  it("lets a vendor select multiple preparing orders and mark them ready in one tap", async () => {
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({ id: "o1", order_number: "0001", status: "preparing" }),
          order({ id: "o2", order_number: "0002", status: "preparing" }),
        ]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(screen.getByRole("button", { name: /^select$/i }));
    await user.click(
      screen.getByRole("checkbox", { name: /select order #0001/i }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: /select order #0002/i }),
    );

    const markReadyButton = screen.getByRole("button", {
      name: /mark 2 ready/i,
    });
    await user.click(markReadyButton);

    await waitFor(() => {
      expect(advanceOrder).toHaveBeenCalledWith("o1");
      expect(advanceOrder).toHaveBeenCalledWith("o2");
    });
    expect(advanceOrder).toHaveBeenCalledTimes(2);
  });
});
