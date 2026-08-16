// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { OrderForm } from "./order-form";
import type { MenuItem, SelectedOption } from "@/lib/types";

const { placeOrder, addRecentOrder, push } = vi.hoisted(() => ({
  placeOrder: vi.fn(),
  addRecentOrder: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/app/o/[code]/actions", () => ({ placeOrder }));
vi.mock("@/lib/recent-orders", () => ({ addRecentOrder }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Stub the customization sheet: when open, expose one button that adds the
// item with a fixed option so the option path is exercised without radix.
vi.mock("@/components/item-customizer", () => ({
  ItemCustomizer: ({
    item,
    onAdd,
  }: {
    item: MenuItem | null;
    onClose: () => void;
    onAdd: (i: MenuItem, o: SelectedOption[]) => void;
  }) =>
    item ? (
      <button
        type="button"
        onClick={() => onAdd(item, [{ group: "Temp", choice: "Iced" }])}
      >
        stub-confirm
      </button>
    ) : null,
}));

const KOPI: MenuItem = {
  id: "kopi",
  name: "Kopi",
  description: "",
  price_cents: 350,
  available: true,
};
const TEH: MenuItem = {
  id: "teh",
  name: "Teh",
  description: "",
  price_cents: 300,
  available: true,
  option_groups: [
    {
      id: "t",
      label: "Temp",
      choices: [{ id: "i", label: "Iced", price_delta_cents: 100 }],
    },
  ],
};

function renderForm(closed = false) {
  return render(
    <OrderForm
      code="code123"
      boothId="b1"
      menuItems={[KOPI, TEH]}
      closed={closed}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear(); // no stale reorder seed leaking between tests
  placeOrder.mockResolvedValue({
    success: true,
    orderNumber: "0042",
    boothId: "b1",
    accessToken: "tok42",
  });
});

describe("OrderForm cart", () => {
  it("adds a plain item and totals it", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByText("Your order")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Place order · 1 item · \$3\.50/ }),
    ).toBeEnabled();
  });

  it("increments and decrements, removing at zero", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Increase Kopi" }));

    // 2 × $3.50 = $7.00 in the submit bar.
    expect(
      screen.getByRole("button", { name: /Place order · 2 items · \$7\.00/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Decrease Kopi" }));
    await user.click(screen.getByRole("button", { name: "Decrease Kopi" }));

    // Cart empty → summary gone, submit disabled with the empty label.
    expect(screen.queryByText("Your order")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add items to order" }),
    ).toBeDisabled();
  });

  it("adds a customized item with its option line", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("button", { name: "stub-confirm" }));

    const cart = screen.getByText("Your order").closest("section")!;
    expect(within(cart).getByText("Teh")).toBeInTheDocument();
    expect(within(cart).getByText("Iced")).toBeInTheDocument();
  });

  it("folds a priced choice's delta into the cart line and submit total", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("button", { name: "stub-confirm" }));

    // Teh is $3.00 base + $1.00 for the priced "Iced" choice = $4.00 — both
    // the cart line price and the order total reflect it.
    const cart = screen.getByText("Your order").closest("section")!;
    expect(within(cart).getAllByText("$4.00")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /Place order · 1 item · \$4\.00/ }),
    ).toBeEnabled();
  });

  it("submits the order, remembers it, and navigates to the status page", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.type(screen.getByLabelText("Your name"), "Ada");
    await user.click(screen.getByRole("button", { name: /Place order/ }));

    await waitFor(() =>
      expect(placeOrder).toHaveBeenCalledWith(
        "code123",
        {
          customerName: "Ada",
          customerPhone: "",
          items: [expect.objectContaining({ menuItemId: "kopi", quantity: 1 })],
        },
        expect.stringMatching(/^[0-9a-f-]{36}$/),
      ),
    );
    expect(addRecentOrder).toHaveBeenCalledWith({
      boothId: "b1",
      orderNumber: "0042",
      customerName: "Ada",
      token: "tok42",
      items: [expect.objectContaining({ menuItemId: "kopi", quantity: 1 })],
    });
    expect(push).toHaveBeenCalledWith("/order/b1/0042?t=tok42");
  });

  it("seeds the cart from a reorder handoff on mount", async () => {
    window.sessionStorage.setItem(
      "qkit:reorder:b1",
      JSON.stringify({
        lines: [{ menuItemId: "kopi", quantity: 2 }],
        customerName: "Bo",
      }),
    );
    renderForm();

    // Cart prefilled (2 × $3.50), name filled, seed consumed (read-once).
    expect(await screen.findByText("Your order")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Place order · 2 items · \$7\.00/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toHaveValue("Bo");
    expect(window.sessionStorage.getItem("qkit:reorder:b1")).toBeNull();
  });

  it("shows a placeholder when the booth has no menu yet", () => {
    render(<OrderForm code="code123" boothId="b1" menuItems={[]} />);
    expect(screen.getByText("Menu coming soon")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add items to order" }),
    ).not.toBeInTheDocument();
  });

  it("restores a persisted cart on mount without clobbering it", async () => {
    window.sessionStorage.setItem(
      "qkit:cart:b1",
      JSON.stringify([{ menuItemId: "kopi", quantity: 2 }]),
    );
    renderForm();

    // Restored (2 × $3.50), and the first empty render did NOT wipe storage.
    expect(await screen.findByText("Your order")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Place order · 2 items · \$7\.00/ }),
    ).toBeInTheDocument();
    expect(window.sessionStorage.getItem("qkit:cart:b1")).not.toBeNull();
    expect(window.sessionStorage.getItem("qkit:cart:b1")).not.toBe("[]");
  });

  it("drops a fully-sold-out persisted cart silently (no toast)", async () => {
    window.sessionStorage.setItem(
      "qkit:cart:b1",
      JSON.stringify([{ menuItemId: "kopi", quantity: 2 }]),
    );
    render(
      <OrderForm
        code="code123"
        boothId="b1"
        menuItems={[KOPI, TEH]}
        remaining={{ kopi: 0 }}
      />,
    );
    // Nothing restored, cleared silently — a refresh shouldn't nag the customer.
    await waitFor(() =>
      expect(window.sessionStorage.getItem("qkit:cart:b1")).toBeNull(),
    );
    expect(screen.queryByText("Your order")).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("warns when only some persisted items sold out", async () => {
    window.sessionStorage.setItem(
      "qkit:cart:b1",
      JSON.stringify([
        { menuItemId: "kopi", quantity: 1 },
        { menuItemId: "teh", quantity: 1 },
      ]),
    );
    render(
      <OrderForm
        code="code123"
        boothId="b1"
        menuItems={[KOPI, TEH]}
        remaining={{ kopi: 0 }}
      />,
    );
    // Teh survives, Kopi is gone → one honest heads-up.
    const cart = (await screen.findByText("Your order")).closest("section")!;
    expect(within(cart).getByText("Teh")).toBeInTheDocument();
    expect(within(cart).queryByText("Kopi")).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("1 item sold out and was removed");
  });

  it("persists the cart on change and clears it after placing the order", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(window.sessionStorage.getItem("qkit:cart:b1")).toContain("kopi");

    await user.type(screen.getByLabelText("Your name"), "Ada");
    await user.click(screen.getByRole("button", { name: /Place order/ }));

    await waitFor(() =>
      expect(window.sessionStorage.getItem("qkit:cart:b1")).toBeNull(),
    );
  });

  it("surfaces a server error and does not navigate", async () => {
    placeOrder.mockResolvedValue({ success: false, error: "Booth not found" });
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.type(screen.getByLabelText("Your name"), "Ada");
    await user.click(screen.getByRole("button", { name: /Place order/ }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Booth not found"),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("retries once on a transient failure, reusing the same idempotency key", async () => {
    placeOrder
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce({
        success: true,
        orderNumber: "0042",
        boothId: "b1",
        accessToken: "tok42",
      });
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.type(screen.getByLabelText("Your name"), "Ada");
    await user.click(screen.getByRole("button", { name: /Place order/ }));

    await waitFor(() => expect(placeOrder).toHaveBeenCalledTimes(2));
    const [firstCallCode, , firstIdem] = placeOrder.mock.calls[0];
    const [secondCallCode, , secondIdem] = placeOrder.mock.calls[1];
    expect(firstCallCode).toBe("code123");
    expect(secondCallCode).toBe("code123");
    expect(secondIdem).toBe(firstIdem); // stable across the retry
    expect(placeOrder).toHaveBeenNthCalledWith(
      2,
      "code123",
      expect.objectContaining({ customerName: "Ada" }),
      secondIdem,
    );
    expect(push).toHaveBeenCalledWith("/order/b1/0042?t=tok42");
  });

  it("renders the phone field as optional and submits successfully when left blank", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.type(screen.getByLabelText("Your name"), "Ada");

    const phoneField = screen.getByLabelText("Phone number (optional)");
    expect(phoneField).toBeInTheDocument();
    expect(phoneField).toHaveValue("");

    await user.click(screen.getByRole("button", { name: /Place order/ }));

    await waitFor(() =>
      expect(placeOrder).toHaveBeenCalledWith(
        "code123",
        expect.objectContaining({ customerName: "Ada", customerPhone: "" }),
        expect.stringMatching(/^[0-9a-f-]{36}$/),
      ),
    );
    expect(push).toHaveBeenCalledWith("/order/b1/0042?t=tok42");
  });

  it("passes the phone value through to placeOrder when filled", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.type(screen.getByLabelText("Your name"), "Ada");
    await user.type(
      screen.getByLabelText("Phone number (optional)"),
      "+6591234567",
    );
    await user.click(screen.getByRole("button", { name: /Place order/ }));

    await waitFor(() =>
      expect(placeOrder).toHaveBeenCalledWith(
        "code123",
        expect.objectContaining({
          customerName: "Ada",
          customerPhone: "+6591234567",
        }),
        expect.stringMatching(/^[0-9a-f-]{36}$/),
      ),
    );
  });

  it("disables ordering when the booth is closed", () => {
    renderForm(true);
    expect(screen.getByRole("button", { name: "Booth closed" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });
});
