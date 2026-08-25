// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuEditor } from "./menu-editor";
import type { MenuItemFormInput } from "@/lib/schemas";
import type { Entitlement } from "@/lib/plan";

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
