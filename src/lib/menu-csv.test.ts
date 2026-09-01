import { describe, it, expect } from "vitest";
import { menuItemsToCsv, csvToMenuItems } from "./menu-csv";
import type { MenuItemFormInput } from "./schemas";

const item = (patch: Partial<MenuItemFormInput> = {}): MenuItemFormInput => ({
  id: "1",
  name: "Kopi O",
  description: "",
  price_cents: 180,
  image_url: null,
  available: true,
  ...patch,
});

describe("menuItemsToCsv", () => {
  it("writes a header row plus one row per item", () => {
    const csv = menuItemsToCsv([item()]);
    expect(csv).toBe("name,description,price,available\nKopi O,,1.80,true");
  });

  it("omits price for an item with no price_cents", () => {
    const csv = menuItemsToCsv([item({ price_cents: undefined })]);
    expect(csv).toContain("Kopi O,,,true");
  });

  it("quotes a description containing a comma", () => {
    const csv = menuItemsToCsv([
      item({ description: "Hot, strong, no sugar" }),
    ]);
    expect(csv).toContain('"Hot, strong, no sugar"');
  });
});

describe("csvToMenuItems", () => {
  it("round-trips a plain row", () => {
    const csv = menuItemsToCsv([item({ description: "Classic" })]);
    const [row] = csvToMenuItems(csv);
    expect(row).toEqual({
      name: "Kopi O",
      description: "Classic",
      price_cents: 180,
      available: true,
    });
  });

  it("round-trips a quoted comma-containing description", () => {
    const csv = menuItemsToCsv([
      item({ description: "Hot, strong, no sugar" }),
    ]);
    const [row] = csvToMenuItems(csv);
    expect(row.description).toBe("Hot, strong, no sugar");
  });

  it("skips the header line", () => {
    const rows = csvToMenuItems("name,description,price,available\nA,,,true");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("A");
  });

  it("flags a row with no name", () => {
    const rows = csvToMenuItems(
      "name,description,price,available\n,,1.00,true",
    );
    expect(rows[0]!.error).toBe("Missing item name");
  });

  it("flags a row with an unparseable price", () => {
    const rows = csvToMenuItems(
      "name,description,price,available\nKopi O,,free,true",
    );
    expect(rows[0]!.error).toContain("Invalid price");
  });

  it("flags a negative price", () => {
    const rows = csvToMenuItems(
      "name,description,price,available\nKopi O,,-1,true",
    );
    expect(rows[0]!.error).toContain("Invalid price");
  });

  it("treats a blank price as unset, not an error", () => {
    const rows = csvToMenuItems(
      "name,description,price,available\nKopi O,,,true",
    );
    expect(rows[0]!.error).toBeUndefined();
    expect(rows[0]!.price_cents).toBeUndefined();
  });

  it("defaults available to true unless the cell is exactly false", () => {
    const rows = csvToMenuItems(
      "name,description,price,available\nA,,,\nB,,,false\nC,,,true",
    );
    expect(rows.map((r) => r.available)).toEqual([true, false, true]);
  });

  it("returns no rows for an empty or header-only input", () => {
    expect(csvToMenuItems("")).toEqual([]);
    expect(csvToMenuItems("name,description,price,available")).toEqual([]);
  });
});
