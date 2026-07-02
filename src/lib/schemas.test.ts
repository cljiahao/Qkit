import { describe, expect, it } from "vitest";
import {
  loginSchema,
  vendorSchema,
  menuItemSchema,
  menuItemFormSchema,
  boothFormSchema,
  placeOrderSchema,
  orderStatusSchema,
  sanitizeOptionGroups,
  parseBoothHours,
  parseMenuItems,
  parseOrderItems,
  paymentConfigSchema,
  parsePaymentConfig,
} from "./schemas";

describe("loginSchema", () => {
  it("accepts a valid email + 8-char password", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.co", password: "12345678" }).success,
    ).toBe(true);
  });

  it("rejects a password shorter than 8", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.co", password: "1234567" }).success,
    ).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(
      loginSchema.safeParse({ email: "not-an-email", password: "12345678" })
        .success,
    ).toBe(false);
  });
});

describe("orderStatusSchema", () => {
  it.each([
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "completed",
    "cancelled",
  ])("accepts %s", (status) => {
    expect(orderStatusSchema.safeParse(status).success).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(orderStatusSchema.safeParse("shipped").success).toBe(false);
    expect(orderStatusSchema.safeParse("").success).toBe(false);
  });
});

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

  const item = (over = {}) => ({
    menuItemId: "1",
    name: "X",
    quantity: 1,
    ...over,
  });

  it("rejects an empty cart (needs at least one item)", () => {
    expect(
      placeOrderSchema.safeParse({ customerName: "Sam", items: [] }).success,
    ).toBe(false);
  });

  it("rejects an empty customer name", () => {
    expect(
      placeOrderSchema.safeParse({ customerName: "", items: [item()] }).success,
    ).toBe(false);
  });

  it("rejects a cart over the 50-line cap (V5)", () => {
    const items = Array.from({ length: 51 }, (_, i) =>
      item({ menuItemId: `${i}` }),
    );
    expect(
      placeOrderSchema.safeParse({ customerName: "Sam", items }).success,
    ).toBe(false);
  });

  it("rejects a price_cents beyond the money cap (V4 overflow guard)", () => {
    expect(
      placeOrderSchema.safeParse({
        customerName: "Sam",
        items: [item({ price_cents: 10_000_00 + 1 })],
      }).success,
    ).toBe(false);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["over the max of 20", 21],
  ])("rejects quantity %s", (_label, quantity) => {
    expect(
      placeOrderSchema.safeParse({
        customerName: "Sam",
        items: [item({ quantity })],
      }).success,
    ).toBe(false);
  });

  it("accepts the quantity boundaries 1 and 20", () => {
    for (const quantity of [1, 20]) {
      expect(
        placeOrderSchema.safeParse({
          customerName: "Sam",
          items: [item({ quantity })],
        }).success,
      ).toBe(true);
    }
  });

  it("rejects an empty menuItemId", () => {
    expect(
      placeOrderSchema.safeParse({
        customerName: "Sam",
        items: [item({ menuItemId: "" })],
      }).success,
    ).toBe(false);
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

  it.each([
    ["a single-digit hour", "9:00"],
    ["trailing garbage (no $ anchor)", "09:00x"],
    ["leading garbage (no ^ anchor)", "x09:00"],
    ["three-digit hour", "100:00"],
  ])("rejects %s as the open time", (_label, open) => {
    expect(parseBoothHours({ mode: "daily", open, close: "18:00" })).toBeNull();
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

describe("paymentConfigSchema", () => {
  it("accepts a pointer with a url", () => {
    expect(
      paymentConfigSchema.safeParse({
        kind: "pointer",
        label: "PayLah",
        url: "https://pay.example/abc",
      }).success,
    ).toBe(true);
  });

  it("rejects a pointer with neither url nor qr_image_url", () => {
    expect(
      paymentConfigSchema.safeParse({ kind: "pointer", label: "x" }).success,
    ).toBe(false);
  });

  it("accepts a paynow with exactly a uen", () => {
    expect(
      paymentConfigSchema.safeParse({
        kind: "paynow",
        payee_name: "Kopitiam Cart",
        uen: "53312345A",
      }).success,
    ).toBe(true);
  });

  it("rejects a paynow with both uen and mobile", () => {
    expect(
      paymentConfigSchema.safeParse({
        kind: "paynow",
        payee_name: "x",
        uen: "53312345A",
        mobile: "+6591234567",
      }).success,
    ).toBe(false);
  });

  it("rejects a paynow with neither uen nor mobile", () => {
    expect(
      paymentConfigSchema.safeParse({ kind: "paynow", payee_name: "x" })
        .success,
    ).toBe(false);
  });
});

describe("parsePaymentConfig", () => {
  it("returns the config for a valid pointer", () => {
    expect(
      parsePaymentConfig({ kind: "pointer", label: "L", url: "https://a.b" }),
    ).toEqual({ kind: "pointer", label: "L", url: "https://a.b" });
  });

  it("returns null for null, malformed, or unknown kind", () => {
    expect(parsePaymentConfig(null)).toBeNull();
    expect(parsePaymentConfig({ kind: "paypal" })).toBeNull();
    expect(parsePaymentConfig({ kind: "paynow" })).toBeNull();
  });
});
