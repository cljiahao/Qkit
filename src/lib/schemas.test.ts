import { describe, expect, it } from "vitest";
import {
  vendorSchema,
  menuItemSchema,
  menuItemFormSchema,
  boothFormSchema,
  placeOrderSchema,
  sanitizeOptionGroups,
  parseBoothHours,
  parseMenuItems,
  parseOrderItems,
} from "./schemas";

describe("vendorSchema", () => {
  it("accepts a valid stall name", () => {
    expect(vendorSchema.safeParse({ name: "Mama's Kitchen" }).success).toBe(
      true,
    );
  });

  it("rejects an empty name", () => {
    expect(vendorSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a name over 100 chars", () => {
    expect(vendorSchema.safeParse({ name: "x".repeat(101) }).success).toBe(
      false,
    );
  });
});

describe("menuItemSchema", () => {
  it("accepts an item with no price", () => {
    expect(
      menuItemSchema.safeParse({
        id: "1",
        name: "Free water",
        available: true,
      }).success,
    ).toBe(true);
  });

  it("accepts an item with a price", () => {
    expect(
      menuItemSchema.safeParse({
        id: "1",
        name: "Laksa",
        price_cents: 600,
        available: true,
      }).success,
    ).toBe(true);
  });
});

describe("boothFormSchema", () => {
  const base = {
    name: "Test Stall",
    image_url: null,
    is_active: true,
    menu_items: [],
  };

  it("accepts a minimal valid booth (no id = create)", () => {
    expect(boothFormSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(boothFormSchema.safeParse({ ...base, name: "" }).success).toBe(
      false,
    );
  });

  it("accepts a uuid boothId (update)", () => {
    expect(
      boothFormSchema.safeParse({
        ...base,
        boothId: "742a0959-e065-41f8-ab27-27eaa3c02a1b",
      }).success,
    ).toBe(true);
  });

  it("accepts items with and without prices", () => {
    expect(
      boothFormSchema.safeParse({
        ...base,
        menu_items: [
          { id: "1", name: "Paid", price_cents: 500, available: true },
          { id: "2", name: "Free", available: false },
        ],
      }).success,
    ).toBe(true);
  });
});

describe("placeOrderSchema", () => {
  it("accepts an order containing a $0 (queue) item", () => {
    expect(
      placeOrderSchema.safeParse({
        customerName: "Sam",
        items: [
          { menuItemId: "1", name: "Free water", price_cents: 0, quantity: 1 },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts an order with an unpriced item", () => {
    expect(
      placeOrderSchema.safeParse({
        customerName: "Sam",
        items: [{ menuItemId: "1", name: "Queue item", quantity: 2 }],
      }).success,
    ).toBe(true);
  });
});

describe("menuItemFormSchema image_url", () => {
  const base = { id: "1", name: "Kopi O", description: "", available: true };

  it("accepts a bucket URL", () => {
    expect(
      menuItemFormSchema.safeParse({
        ...base,
        image_url: "https://abc.supabase.co/storage/v1/object/public/x.png",
      }).success,
    ).toBe(true);
  });

  it("accepts a relative /seed path", () => {
    expect(
      menuItemFormSchema.safeParse({ ...base, image_url: "/seed/kopi.svg" })
        .success,
    ).toBe(true);
  });

  it("accepts null", () => {
    expect(
      menuItemFormSchema.safeParse({ ...base, image_url: null }).success,
    ).toBe(true);
  });

  it("accepts a missing image_url", () => {
    expect(menuItemFormSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a bare non-url, non-path string", () => {
    expect(
      menuItemFormSchema.safeParse({ ...base, image_url: "kopi" }).success,
    ).toBe(false);
  });
});

describe("menuItemSchema option_groups", () => {
  it("parses an item with option groups", () => {
    const parsed = menuItemSchema.safeParse({
      id: "kopi",
      name: "Kopi",
      available: true,
      option_groups: [
        {
          id: "temp",
          label: "Temperature",
          choices: [
            { id: "hot", label: "Hot" },
            { id: "iced", label: "Iced" },
          ],
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an item with no option groups", () => {
    expect(
      menuItemSchema.safeParse({ id: "x", name: "Water", available: true })
        .success,
    ).toBe(true);
  });

  it("accepts a multi-select group", () => {
    const parsed = menuItemSchema.safeParse({
      id: "burger",
      name: "Burger",
      available: true,
      option_groups: [
        {
          id: "addons",
          label: "Add-ons",
          multiple: true,
          choices: [
            { id: "egg", label: "Egg" },
            { id: "cheese", label: "Cheese" },
          ],
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("sanitizeOptionGroups", () => {
  it("returns undefined for empty/undefined input", () => {
    expect(sanitizeOptionGroups(undefined)).toBeUndefined();
    expect(sanitizeOptionGroups([])).toBeUndefined();
  });

  it("drops a group with a blank label", () => {
    expect(
      sanitizeOptionGroups([
        { id: "g", label: "   ", choices: [{ id: "c", label: "X" }] },
      ]),
    ).toBeUndefined();
  });

  it("drops a group left with no non-blank choices", () => {
    expect(
      sanitizeOptionGroups([
        { id: "g", label: "Size", choices: [{ id: "c", label: "  " }] },
      ]),
    ).toBeUndefined();
  });

  it("trims labels and keeps valid groups, preserving multiple", () => {
    const result = sanitizeOptionGroups([
      {
        id: "g",
        label: "  Add-ons ",
        multiple: true,
        choices: [
          { id: "a", label: " Egg " },
          { id: "b", label: "" },
        ],
      },
    ]);
    expect(result).toEqual([
      {
        id: "g",
        label: "Add-ons",
        multiple: true,
        choices: [{ id: "a", label: "Egg" }],
      },
    ]);
  });
});

describe("placeOrderSchema options", () => {
  it("accepts an order item carrying selected options", () => {
    expect(
      placeOrderSchema.safeParse({
        customerName: "Sam",
        items: [
          {
            menuItemId: "kopi",
            name: "Kopi",
            price_cents: 140,
            quantity: 1,
            options: [
              { group: "Temperature", choice: "Iced" },
              { group: "Sugar", choice: "Less" },
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects a malformed option (empty choice)", () => {
    expect(
      placeOrderSchema.safeParse({
        customerName: "Sam",
        items: [
          {
            menuItemId: "kopi",
            name: "Kopi",
            quantity: 1,
            options: [{ group: "Temperature", choice: "" }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("parseBoothHours", () => {
  it("returns null for null / undefined / garbage", () => {
    expect(parseBoothHours(null)).toBeNull();
    expect(parseBoothHours(undefined)).toBeNull();
    expect(parseBoothHours({ mode: "monthly" })).toBeNull();
    expect(parseBoothHours("nope")).toBeNull();
  });

  it("passes a valid daily window through", () => {
    expect(
      parseBoothHours({ mode: "daily", open: "10:00", close: "18:00" }),
    ).toEqual({ mode: "daily", open: "10:00", close: "18:00" });
  });

  it("degrades a daily window with a malformed time to null", () => {
    expect(
      parseBoothHours({ mode: "daily", open: "10am", close: "18:00" }),
    ).toBeNull();
  });

  it("passes a valid weekly schedule through", () => {
    const weekly = {
      mode: "weekly" as const,
      days: {
        mon: null,
        tue: null,
        wed: null,
        thu: null,
        fri: { open: "10:00", close: "18:00" },
        sat: null,
        sun: null,
      },
    };
    expect(parseBoothHours(weekly)).toEqual(weekly);
  });
});

describe("parseMenuItems", () => {
  it("returns [] for a non-array", () => {
    expect(parseMenuItems(null)).toEqual([]);
    expect(parseMenuItems({})).toEqual([]);
  });

  it("keeps valid items and drops malformed ones", () => {
    const out = parseMenuItems([
      { id: "kopi", name: "Kopi", available: true },
      { id: "bad" }, // missing name + available
      { id: "teh", name: "Teh", price_cents: 140, available: false },
    ]);
    expect(out.map((i) => i.id)).toEqual(["kopi", "teh"]);
    expect(out[0].description).toBe(""); // default applied
  });
});

describe("parseOrderItems", () => {
  it("returns [] for a non-array", () => {
    expect(parseOrderItems("nope")).toEqual([]);
  });

  it("keeps valid items and drops malformed ones", () => {
    const out = parseOrderItems([
      { menuItemId: "kopi", name: "Kopi", quantity: 2 },
      { menuItemId: "bad", name: "Bad", quantity: 0 }, // quantity < 1
      { name: "NoId", quantity: 1 }, // missing menuItemId
    ]);
    expect(out.map((i) => i.menuItemId)).toEqual(["kopi"]);
    expect(out[0].quantity).toBe(2);
  });
});
