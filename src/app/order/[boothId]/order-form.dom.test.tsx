// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderForm } from "./order-form";
import type { MenuItem, SelectedOption } from "@/lib/types";

const { placeOrder, addRecentOrder, push } = vi.hoisted(() => ({
  placeOrder: vi.fn(),
  addRecentOrder: vi.fn(),
  push: vi.fn(),
}));

vi.mock("./actions", () => ({ placeOrder }));
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
    { id: "t", label: "Temp", choices: [{ id: "i", label: "Iced" }] },
  ],
};

function renderForm(closed = false) {
  return render(
    <OrderForm boothId="b1" menuItems={[KOPI, TEH]} closed={closed} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear(); // no stale reorder seed leaking between tests
  placeOrder.mockResolvedValue({ success: true, orderNumber: "0042" });
});

describe("OrderForm cart", () => {
  it("adds a plain item and totals it", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByText("Your order")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Place order · \$3\.50/ }),
    ).toBeEnabled();
  });

  it("increments and decrements, removing at zero", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Add one" }));

    // 2 × $3.50 = $7.00 in the submit bar.
    expect(
      screen.getByRole("button", { name: /Place order · \$7\.00/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove one" }));
    await user.click(screen.getByRole("button", { name: "Remove one" }));

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

  it("submits the order, remembers it, and navigates to the status page", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.type(screen.getByLabelText("Your name"), "Ada");
    await user.click(screen.getByRole("button", { name: /Place order/ }));

    await waitFor(() =>
      expect(placeOrder).toHaveBeenCalledWith("b1", {
        customerName: "Ada",
        items: [expect.objectContaining({ menuItemId: "kopi", quantity: 1 })],
      }),
    );
    expect(addRecentOrder).toHaveBeenCalledWith({
      boothId: "b1",
      orderNumber: "0042",
      customerName: "Ada",
      items: [expect.objectContaining({ menuItemId: "kopi", quantity: 1 })],
    });
    expect(push).toHaveBeenCalledWith("/order/b1/0042");
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
      screen.getByRole("button", { name: /Place order · \$7\.00/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toHaveValue("Bo");
    expect(window.sessionStorage.getItem("qkit:reorder:b1")).toBeNull();
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

  it("disables ordering when the booth is closed", () => {
    renderForm(true);
    expect(screen.getByRole("button", { name: "Booth closed" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });
});
