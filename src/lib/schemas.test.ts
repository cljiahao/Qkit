import { describe, expect, it } from "vitest";
import {
  vendorSchema,
  menuItemSchema,
  menuItemFormSchema,
  boothFormSchema,
  placeOrderSchema,
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
      menuItemFormSchema.safeParse({ ...base, image_url: "/seed/kopi-o.svg" })
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
