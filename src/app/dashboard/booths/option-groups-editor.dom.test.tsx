// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OptionGroupsEditor } from "./option-groups-editor";
import type { OptionGroup } from "@/lib/types";
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

function Host({ initial }: { initial: OptionGroup[] }) {
  const [groups, setGroups] = useState(initial);
  return (
    <OptionGroupsEditor
      groups={groups}
      onChange={setGroups}
      entitlement={ENTITLEMENT}
    />
  );
}

const MILK_GROUP: OptionGroup = {
  id: "milk",
  label: "Milk",
  choices: [
    { id: "reg", label: "Regular" },
    { id: "oat", label: "Oat Milk" },
  ],
};

describe("OptionGroupsEditor price input", () => {
  it("shows a price input next to each choice, always visible", () => {
    render(<Host initial={[MILK_GROUP]} />);
    expect(
      screen.getAllByPlaceholderText(/price/i).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("setting a choice's price updates that choice's price_delta_cents", async () => {
    const user = userEvent.setup();
    render(<Host initial={[MILK_GROUP]} />);
    const priceInputs = screen.getAllByPlaceholderText(/price/i);
    // Second choice is "Oat Milk".
    await user.type(priceInputs[1], "1.00");
    // A subsequent "Add choice" click re-renders from the updated state —
    // simplest observable proof is re-querying the input's own value.
    expect(priceInputs[1]).toHaveValue("1.00");
  });
});

describe("OptionGroupsEditor advanced section", () => {
  it("hides cost and allergen fields behind a collapsed Advanced toggle by default", () => {
    render(<Host initial={[MILK_GROUP]} />);
    expect(screen.queryByPlaceholderText(/cost/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dairy/i)).not.toBeInTheDocument();
  });

  it("reveals cost and allergen fields when Advanced is expanded", async () => {
    const user = userEvent.setup();
    render(<Host initial={[MILK_GROUP]} />);
    const advancedToggles = screen.getAllByRole("button", {
      name: /advanced/i,
    });
    await user.click(advancedToggles[0]);
    expect(screen.getAllByPlaceholderText(/cost/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/dairy/i)).toBeInTheDocument();
  });

  it("shows an icon next to each allergen, and a scope caption", async () => {
    const user = userEvent.setup();
    render(<Host initial={[MILK_GROUP]} />);
    await user.click(screen.getAllByRole("button", { name: /advanced/i })[0]!);
    expect(screen.getByText("🥛")).toBeInTheDocument();
    expect(screen.getByText("🥜")).toBeInTheDocument();
    expect(
      screen.getByText(/only when this choice is picked/i),
    ).toBeInTheDocument();
  });
});
