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
