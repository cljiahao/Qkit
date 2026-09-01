// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuEditor, reorderMenuItems } from "./menu-editor";
import type { MenuItemFormInput } from "@/lib/schemas";
import type { Entitlement } from "@/lib/plan";
import type { MenuCategory } from "@/lib/types";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
beforeEach(() => toast.mockClear());

const ENTITLEMENT: Entitlement = {
  tier: "pro",
  maxBooths: null,
  maxMenuItems: 100,
  maxOptionGroupsPerItem: 10,
  autoCloseHours: true,
  stockCaps: true,
  statsRanges: ["24h", "7d", "30d"],
};

const ITEM: MenuItemFormInput = {
  id: "latte",
  name: "Latte",
  description: "",
  price_cents: 500,
  available: true,
};

function Host() {
  const [items, setItems] = useState<MenuItemFormInput[]>([ITEM]);
  return (
    <MenuEditor
      vendorId="v1"
      items={items}
      onChange={setItems}
      entitlement={ENTITLEMENT}
    />
  );
}

describe("reorderMenuItems", () => {
  const items: MenuItemFormInput[] = [
    { ...ITEM, id: "a", name: "A" },
    { ...ITEM, id: "b", name: "B" },
    { ...ITEM, id: "c", name: "C" },
  ];

  it("moves the active item to the dropped-on item's position", () => {
    const result = reorderMenuItems(items, "a", "c");
    expect(result.map((it) => it.id)).toEqual(["b", "c", "a"]);
  });

  it("returns the same array instance when dropped on itself", () => {
    expect(reorderMenuItems(items, "b", "b")).toBe(items);
  });

  it("returns the same array instance for an unknown id", () => {
    expect(reorderMenuItems(items, "a", "missing")).toBe(items);
  });
});

function HostWithTwo() {
  const [items, setItems] = useState<MenuItemFormInput[]>([
    { ...ITEM, id: "a", name: "A" },
    { ...ITEM, id: "b", name: "B" },
  ]);
  return (
    <MenuEditor
      vendorId="v1"
      items={items}
      onChange={setItems}
      entitlement={ENTITLEMENT}
    />
  );
}

describe("MenuEditor drag handle", () => {
  it("renders one reorder handle per item", () => {
    render(<HostWithTwo />);
    expect(
      screen.getAllByRole("button", { name: "Reorder item" }),
    ).toHaveLength(2);
  });
});

describe("MenuEditor item-level allergens", () => {
  it("hides the allergen checkboxes behind a collapsed Advanced toggle by default", () => {
    render(<Host />);
    expect(screen.queryByText(/dairy/i)).not.toBeInTheDocument();
  });

  it("reveals allergen checkboxes when Advanced is expanded", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole("button", { name: /advanced/i }));
    expect(screen.getByText(/dairy/i)).toBeInTheDocument();
  });

  it("renders an icon next to each allergen checkbox label", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole("button", { name: /advanced/i }));
    expect(screen.getByText("🥛")).toBeInTheDocument();
    expect(screen.getByText("🥜")).toBeInTheDocument();
  });
});

describe("MenuEditor allergen summary badges", () => {
  it("shows no icon summary when the item has no allergens set", () => {
    render(<Host />);
    expect(
      screen.queryByLabelText(/contains allergens/i),
    ).not.toBeInTheDocument();
  });

  it("shows an icon-only summary next to the item header when allergens are set", () => {
    function HostWithAllergen() {
      const [items, setItems] = useState<MenuItemFormInput[]>([
        { ...ITEM, allergens: ["dairy", "nuts"] },
      ]);
      return (
        <MenuEditor
          vendorId="v1"
          items={items}
          onChange={setItems}
          entitlement={ENTITLEMENT}
        />
      );
    }
    render(<HostWithAllergen />);
    const summary = screen.getByLabelText(/contains allergens: dairy, nuts/i);
    expect(summary).toBeInTheDocument();
    expect(summary).toHaveTextContent("🥛");
    expect(summary).toHaveTextContent("🌰");
    // Collapsed by default — the summary is visible without expanding Advanced.
    expect(screen.queryByText(/dairy/i)).not.toBeInTheDocument();
  });
});

const ITEM_WITH_GROUPS: MenuItemFormInput = {
  id: "latte",
  name: "Latte",
  description: "",
  price_cents: 500,
  available: true,
  allergens: ["dairy"],
  option_groups: [
    {
      id: "size",
      label: "Size",
      choices: [{ id: "s", label: "Small" }],
    },
  ],
};

function HostWithGroups() {
  const [items, setItems] = useState<MenuItemFormInput[]>([ITEM_WITH_GROUPS]);
  return (
    <MenuEditor
      vendorId="v1"
      items={items}
      onChange={setItems}
      entitlement={ENTITLEMENT}
    />
  );
}

const CATEGORIES: MenuCategory[] = [
  { id: "drinks", label: "Drinks" },
  { id: "snacks", label: "Snacks" },
];

function HostWithCategories() {
  const [items, setItems] = useState<MenuItemFormInput[]>([ITEM]);
  return (
    <MenuEditor
      vendorId="v1"
      items={items}
      onChange={setItems}
      entitlement={ENTITLEMENT}
      categories={CATEGORIES}
    />
  );
}

describe("MenuEditor category picker", () => {
  it("shows nothing when there are no categories", () => {
    render(<Host />);
    expect(screen.queryByText("Section")).not.toBeInTheDocument();
  });

  it("shows a section picker, defaulting to No section", () => {
    render(<HostWithCategories />);
    expect(screen.getByText("Section")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("No section");
  });

  it("picking a section updates the item's category", async () => {
    const user = userEvent.setup();
    render(<HostWithCategories />);
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Snacks" }));
    expect(screen.getByRole("combobox")).toHaveTextContent("Snacks");
  });
});

describe("MenuEditor availability toggle", () => {
  it("renders Available as a switch, checked by default", () => {
    render(<Host />);
    expect(screen.getByRole("switch", { name: "Available" })).toBeChecked();
  });

  it("toggling it flips the item's available flag", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole("switch", { name: "Available" }));
    expect(screen.getByRole("switch", { name: "Available" })).not.toBeChecked();
  });
});

describe("MenuEditor remove item", () => {
  it("removes the item and offers an Undo toast", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole("button", { name: "Remove item" }));

    expect(screen.queryByPlaceholderText("Item name")).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(
      "Latte removed",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
      }),
    );
  });

  it("Undo restores the item without clobbering an edit made in between", async () => {
    const user = userEvent.setup();
    render(<HostWithTwo />);
    await user.click(
      screen.getAllByRole("button", { name: "Remove item" })[0]!,
    );
    // Edit the surviving item after the removal, before clicking Undo.
    const remainingName = screen.getByPlaceholderText("Item name");
    await user.clear(remainingName);
    await user.type(remainingName, "B edited");

    const restore = toast.mock.calls[0]![1].action.onClick;
    act(() => restore());

    const names = screen
      .getAllByPlaceholderText("Item name")
      .map((el) => (el as HTMLInputElement).value);
    expect(names).toEqual(["A", "B edited"]);
  });
});

describe("MenuEditor duplicate item", () => {
  it("creates an independent copy with a distinct name and id", async () => {
    const user = userEvent.setup();
    render(<HostWithGroups />);
    await user.click(screen.getByRole("button", { name: /duplicate item/i }));
    const names = screen.getAllByPlaceholderText("Item name");
    expect(names).toHaveLength(2);
    expect((names[1] as HTMLInputElement).value).toBe("Latte (copy)");
  });

  it("editing the copy's name never mutates the original", async () => {
    const user = userEvent.setup();
    render(<HostWithGroups />);
    await user.click(screen.getByRole("button", { name: /duplicate item/i }));
    const names = screen.getAllByPlaceholderText("Item name");
    await user.clear(names[1]);
    await user.type(names[1], "Cappuccino");
    expect((names[0] as HTMLInputElement).value).toBe("Latte");
  });

  it("carries over option groups and allergens as independent data", async () => {
    const user = userEvent.setup();
    render(<HostWithGroups />);
    await user.click(screen.getByRole("button", { name: /duplicate item/i }));
    const advancedButtons = screen.getAllByRole("button", {
      name: /advanced/i,
    });
    await user.click(advancedButtons[1]);
    expect(screen.getAllByText(/dairy/i).length).toBeGreaterThan(0);
    const customizationButtons = screen.getAllByRole("button", {
      name: /customization/i,
    });
    expect(customizationButtons[1]).toHaveTextContent("1");
  });

  it("disables duplication once the menu-item cap is reached", () => {
    render(
      <MenuEditor
        vendorId="v1"
        items={[ITEM_WITH_GROUPS]}
        onChange={() => {}}
        entitlement={{ ...ENTITLEMENT, maxMenuItems: 1 }}
      />,
    );
    expect(
      screen.getByRole("button", { name: /duplicate item/i }),
    ).toBeDisabled();
  });
});
