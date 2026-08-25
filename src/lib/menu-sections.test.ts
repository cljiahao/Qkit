import { describe, expect, it } from "vitest";
import { groupByCategory } from "./menu-sections";
import type { MenuItem, MenuCategory } from "./types";

function item(id: string, category?: string | null): MenuItem {
  return { id, name: id, description: "", available: true, category };
}

const DRINKS: MenuCategory = { id: "drinks", label: "Drinks" };
const MAINS: MenuCategory = { id: "mains", label: "Mains" };

describe("groupByCategory", () => {
  it("groups items under their category, in category order", () => {
    const sections = groupByCategory(
      [item("kopi", "drinks"), item("rice", "mains"), item("teh", "drinks")],
      [DRINKS, MAINS],
    );
    expect(sections.map((s) => s.id)).toEqual(["drinks", "mains"]);
    expect(sections[0].items.map((i) => i.id)).toEqual(["kopi", "teh"]);
  });

  it("buckets missing/unmatched category ids into Other, last", () => {
    const sections = groupByCategory(
      [item("kopi", "drinks"), item("mystery", "stale-id"), item("plain")],
      [DRINKS],
    );
    expect(sections.map((s) => s.id)).toEqual(["drinks", "other"]);
    expect(sections[1].items.map((i) => i.id)).toEqual(["mystery", "plain"]);
  });

  it("drops empty sections", () => {
    const sections = groupByCategory([item("kopi", "drinks")], [DRINKS, MAINS]);
    expect(sections.map((s) => s.id)).toEqual(["drinks"]);
  });

  it("returns everything under Other when no categories are defined", () => {
    const sections = groupByCategory([item("kopi"), item("rice")], []);
    expect(sections).toEqual([
      { id: "other", label: "Other", items: [item("kopi"), item("rice")] },
    ]);
  });
});
