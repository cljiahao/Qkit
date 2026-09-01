// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MenuCategoriesEditor,
  reorderCategories,
} from "./menu-categories-editor";
import type { MenuCategory } from "@/lib/types";

function Host({ initial }: { initial: MenuCategory[] }) {
  const [categories, setCategories] = useState(initial);
  return (
    <MenuCategoriesEditor categories={categories} onChange={setCategories} />
  );
}

describe("reorderCategories", () => {
  const categories: MenuCategory[] = [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
    { id: "c", label: "C" },
  ];

  it("moves the active category to the dropped-on category's position", () => {
    const result = reorderCategories(categories, "a", "c");
    expect(result.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  it("returns the same array instance when dropped on itself", () => {
    expect(reorderCategories(categories, "b", "b")).toBe(categories);
  });

  it("returns the same array instance for an unknown id", () => {
    expect(reorderCategories(categories, "a", "missing")).toBe(categories);
  });
});

describe("MenuCategoriesEditor", () => {
  it("shows an empty-state hint with no sections", () => {
    render(<Host initial={[]} />);
    expect(screen.getByText(/no sections yet/i)).toBeInTheDocument();
  });

  it("adds a new section", async () => {
    const user = userEvent.setup();
    render(<Host initial={[]} />);
    await user.click(screen.getByRole("button", { name: /add section/i }));
    expect(screen.getByPlaceholderText(/section name/i)).toBeInTheDocument();
  });

  it("renames a section", async () => {
    const user = userEvent.setup();
    render(<Host initial={[{ id: "c1", label: "Drinks" }]} />);
    const input = screen.getByDisplayValue("Drinks");
    await user.clear(input);
    await user.type(input, "Beverages");
    expect(input).toHaveValue("Beverages");
  });

  it("removes a section", async () => {
    const user = userEvent.setup();
    render(<Host initial={[{ id: "c1", label: "Drinks" }]} />);
    await user.click(screen.getByRole("button", { name: /remove section/i }));
    expect(screen.queryByDisplayValue("Drinks")).not.toBeInTheDocument();
    expect(screen.getByText(/no sections yet/i)).toBeInTheDocument();
  });

  it("renders one reorder handle per section", () => {
    render(
      <Host
        initial={[
          { id: "c1", label: "Drinks" },
          { id: "c2", label: "Snacks" },
        ]}
      />,
    );
    expect(
      screen.getAllByRole("button", { name: "Reorder section" }),
    ).toHaveLength(2);
  });

  it("disables Add section at the 40-section cap", () => {
    const categories = Array.from({ length: 40 }, (_, i) => ({
      id: `c${i}`,
      label: `Section ${i}`,
    }));
    render(<Host initial={categories} />);
    expect(screen.getByRole("button", { name: /add section/i })).toBeDisabled();
  });
});
