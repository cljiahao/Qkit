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
    payment_proof_path: null,
    payment_proof_hash: null,
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
  sweepAbandonedPayments: vi.fn(),
  advanceOrder: vi.fn(),
}));

const BOOTHS = [{ id: "b1", name: "Kopi Corner", is_active: true, open: true }];

// OrderCard emphasizes the order number's trailing digit in its own <span>
// (see splitTrailingDigit), so its text is split across elements — a plain
// string/regex getByText can't match that (TRL's own hint: use a function
// matcher). Always pass with { selector: "p" } (ORDER_NUMBER_OPTS below) so
// the (identical-text) wrapping <div> around it isn't also a match.
function byOrderNumber(pattern: string | RegExp) {
  return (_content: string, element: Element | null) => {
    const text = element?.textContent ?? "";
    return typeof pattern === "string" ? text === pattern : pattern.test(text);
  };
}
const ORDER_NUMBER_OPTS = { selector: "p" };

// DEFAULT_BOARD_SETTINGS has daily_order_number_reset on (migration 0067 turned
// it on vendor-wide), but the board only rebases orders placed today, matching
// the server-side baseline query. order()'s default created_at is an earlier
// day, so those cards show the raw order_number (#0001); the daily-reset tests
// below pass today's timestamp, or a baseline, to see a rank (#001).

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
      screen
        .getAllByText(byOrderNumber(/^#000[12]$/), ORDER_NUMBER_OPTS)
        .map((el) => el.textContent);

    expect(numbersInOrder()).toEqual(["#0001", "#0002"]);
    expect(
      screen.getByRole("button", { name: "Earliest", pressed: true }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Latest" }));

    expect(numbersInOrder()).toEqual(["#0002", "#0001"]);
    expect(
      screen.getByRole("button", { name: "Latest", pressed: true }),
    ).toBeInTheDocument();
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
    expect(
      screen.getByText(byOrderNumber("#0847"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
  });

  const TODAY = new Date().toISOString();

  it("derives its own baseline when the board was opened before the day's first order", () => {
    // The server page has no baseline to send for a booth with no order yet
    // (staff open the board while setting up, which is the normal case at an
    // event). The board must still show the daily rank the customer's status
    // page, the TV display and the printed label each compute per request.
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({ id: "b", order_number: "0848", created_at: TODAY }),
          order({ id: "a", order_number: "0847", created_at: TODAY }),
          order({ id: "none", order_number: null, created_at: TODAY }),
        ]}
        boardSettings={{
          ...DEFAULT_BOARD_SETTINGS,
          daily_order_number_reset: true,
        }}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByText(byOrderNumber("#001"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
    expect(
      screen.getByText(byOrderNumber("#002"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(byOrderNumber("#0847"), ORDER_NUMBER_OPTS),
    ).not.toBeInTheDocument();
  });

  it("ignores an order carried over from an earlier day", () => {
    // Its permanent number is what the customer's status page, the TV display
    // and the printed label all show for it, since none of them can rebase an
    // order that predates today's first.
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({
            id: "yesterday",
            order_number: "0002",
            created_at: "2026-06-12T04:00:00Z",
          }),
        ]}
        boardSettings={{
          ...DEFAULT_BOARD_SETTINGS,
          daily_order_number_reset: true,
        }}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByText(byOrderNumber("#0002"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(byOrderNumber("#001"), ORDER_NUMBER_OPTS),
    ).not.toBeInTheDocument();
  });

  it("derives a baseline per booth, not one across booths", () => {
    render(
      <RealtimeOrderBoard
        booths={[
          ...BOOTHS,
          { id: "b2", name: "Teh Tarik Stand", is_active: true, open: true },
        ]}
        initialOrders={[
          order({
            id: "a",
            booth_id: "b1",
            order_number: "0847",
            created_at: TODAY,
          }),
          order({
            id: "b",
            booth_id: "b2",
            order_number: "0901",
            created_at: TODAY,
          }),
        ]}
        boardSettings={{
          ...DEFAULT_BOARD_SETTINGS,
          daily_order_number_reset: true,
        }}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getAllByText(byOrderNumber("#001"), ORDER_NUMBER_OPTS),
    ).toHaveLength(2);
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
    expect(
      screen.getByText(byOrderNumber("#003"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(byOrderNumber("#0847"), ORDER_NUMBER_OPTS),
    ).not.toBeInTheDocument();
  });
});

describe("RealtimeOrderBoard phone section switcher", () => {
  function twoSections() {
    return [
      order({ id: "in", order_number: "0020", status: "pending" }),
      order({ id: "acc", order_number: "0021", status: "preparing" }),
    ];
  }

  it("offers both sections with their counts, so neither can be missed", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={twoSections()}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByRole("tab", { name: "Incoming (1)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Accepted (1)" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("switches which section a phone shows", async () => {
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={twoSections()}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    await user.click(screen.getByRole("tab", { name: "Accepted (1)" }));
    expect(screen.getByRole("tab", { name: "Accepted (1)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("does not offer a switch when only one section has orders", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[order({ id: "in", status: "pending" })]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});

describe("RealtimeOrderBoard passed-over orders", () => {
  // A barista calls a number across a noisy counter, nobody marks it, and a
  // later order goes out first (Kessie's AAR, issue #5).
  it("flags an order a later one has already passed", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({
            id: "ten",
            order_number: "0010",
            status: "preparing",
            created_at: "2026-10-06T04:10:00Z",
          }),
          order({
            id: "fifteen",
            order_number: "0015",
            status: "ready",
            created_at: "2026-10-06T04:15:00Z",
          }),
        ]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getAllByText("A later order is already out")).toHaveLength(1);
  });

  it("flags nothing while the queue is served in order", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({
            id: "ten",
            order_number: "0010",
            status: "ready",
            created_at: "2026-10-06T04:10:00Z",
          }),
          order({
            id: "fifteen",
            order_number: "0015",
            status: "preparing",
            created_at: "2026-10-06T04:15:00Z",
          }),
        ]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.queryByText("A later order is already out"),
    ).not.toBeInTheDocument();
  });
});

describe("RealtimeOrderBoard cup cap counter", () => {
  it("shows items sold against the booth's cap", () => {
    render(
      <RealtimeOrderBoard
        booths={[{ ...BOOTHS[0], daily_cup_cap: 200, cups_today: 132 }]}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByText("132/200 items")).toBeInTheDocument();
  });

  it("shows nothing for a booth with no cap", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.queryByText(/\d items$/)).not.toBeInTheDocument();
  });

  it("warns inside the last tenth of the cap, so staff can tell the queue", () => {
    render(
      <RealtimeOrderBoard
        booths={[{ ...BOOTHS[0], daily_cup_cap: 200, cups_today: 185 }]}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByText("185/200 items")).toHaveClass("text-status-aging");
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

describe("RealtimeOrderBoard incoming/accepted split", () => {
  it("groups a pending order under Incoming, separate from an accepted one", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({ id: "o1", order_number: "0001", status: "pending" }),
          order({ id: "o2", order_number: "0002", status: "preparing" }),
        ]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    // Each label appears twice now: the section heading, and the phone-only
    // SectionSwitcher tab. Query the headings specifically.
    expect(
      screen.getByRole("heading", { name: "Incoming (1)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Accepted (1)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /start now/i }),
    ).toBeInTheDocument();
  });

  it("shows no section headers when every order is already accepted", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[order({ id: "o1", status: "preparing" })]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    expect(screen.queryByText(/^Incoming/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Accepted/)).not.toBeInTheDocument();
  });
});

describe("RealtimeOrderBoard payment filter", () => {
  it("hides a pending-payment QR order from the board", () => {
    const orders = [
      order({
        id: "1",
        order_number: "0001",
        status: "pending",
        payment_status: "pending",
        source: "qr",
      }),
      order({
        id: "2",
        order_number: "0002",
        status: "pending",
        payment_status: "not_required",
        source: "qr",
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
    expect(
      screen.queryByText(byOrderNumber(/#0001/), ORDER_NUMBER_OPTS),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(byOrderNumber(/#0002/), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
  });

  it("still shows a pending-payment walk-up order", () => {
    const orders = [
      order({
        id: "1",
        order_number: "0001",
        status: "pending",
        payment_status: "pending",
        source: "walkup",
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
    expect(
      screen.getByText(byOrderNumber(/#0001/), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
  });
});
