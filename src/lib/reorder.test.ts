import { describe, it, expect } from "vitest";
import { reconcileReorder, type ReorderLine } from "./reorder";
import type { MenuItem } from "@/lib/types";

const latte: MenuItem = {
  id: "latte",
  name: "Latte",
  description: "",
  price_cents: 500,
  available: true,
  option_groups: [
    {
      id: "milk",
      label: "Milk",
      choices: [
        { id: "oat", label: "Oat" },
        { id: "soy", label: "Soy" },
      ],
    },
  ],
};

const cookie: MenuItem = {
  id: "cookie",
  name: "Cookie",
  description: "",
  price_cents: 300,
  available: true,
};

const menu: MenuItem[] = [latte, cookie];

describe("reconcileReorder", () => {
  it("rebuilds a simple line against the current menu", () => {
    const lines: ReorderLine[] = [{ menuItemId: "cookie", quantity: 2 }];
    const { items, unavailable } = reconcileReorder(lines, menu);
    expect(unavailable).toBe(0);
    expect(items).toEqual([
      {
        menuItemId: "cookie",
        name: "Cookie",
        price_cents: 300,
        options: undefined,
        quantity: 2,
      },
    ]);
  });

  it("uses the CURRENT price, not any stale snapshot", () => {
    const dearer = [{ ...cookie, price_cents: 350 }];
    const { items } = reconcileReorder(
      [{ menuItemId: "cookie", quantity: 1 }],
      dearer,
    );
    expect(items[0].price_cents).toBe(350);
  });

  it("marks a removed item as unavailable", () => {
    const { items, unavailable } = reconcileReorder(
      [{ menuItemId: "ghost", quantity: 1 }],
      menu,
    );
    expect(items).toEqual([]);
    expect(unavailable).toBe(1);
  });

  it("skips an item that is currently turned off (available: false)", () => {
    const offMenu: MenuItem[] = [{ ...cookie, available: false }];
    const { items, unavailable } = reconcileReorder(
      [{ menuItemId: "cookie", quantity: 1 }],
      offMenu,
    );
    expect(items).toEqual([]);
    expect(unavailable).toBe(1);
  });

  it("keeps a line whose options still exist (matched by label)", () => {
    const { items, unavailable } = reconcileReorder(
      [
        {
          menuItemId: "latte",
          quantity: 1,
          options: [{ group: "Milk", choice: "Oat" }],
        },
      ],
      menu,
    );
    expect(unavailable).toBe(0);
    expect(items[0].options).toEqual([{ group: "Milk", choice: "Oat" }]);
  });

  it("drops a line whose option no longer exists", () => {
    const { items, unavailable } = reconcileReorder(
      [
        {
          menuItemId: "latte",
          quantity: 1,
          options: [{ group: "Milk", choice: "Almond" }], // removed choice
        },
      ],
      menu,
    );
    expect(items).toEqual([]);
    expect(unavailable).toBe(1);
  });

  it("merges duplicate lines (same item + options) and sums quantity", () => {
    const lines: ReorderLine[] = [
      {
        menuItemId: "latte",
        quantity: 1,
        options: [{ group: "Milk", choice: "Oat" }],
      },
      {
        menuItemId: "latte",
        quantity: 2,
        options: [{ group: "Milk", choice: "Oat" }],
      },
    ];
    const { items } = reconcileReorder(lines, menu);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
  });

  it("treats different options on the same item as separate lines", () => {
    const lines: ReorderLine[] = [
      {
        menuItemId: "latte",
        quantity: 1,
        options: [{ group: "Milk", choice: "Oat" }],
      },
      {
        menuItemId: "latte",
        quantity: 1,
        options: [{ group: "Milk", choice: "Soy" }],
      },
    ];
    const { items } = reconcileReorder(lines, menu);
    expect(items).toHaveLength(2);
  });

  it("clamps quantity to remaining stock", () => {
    const { items, unavailable } = reconcileReorder(
      [{ menuItemId: "cookie", quantity: 5 }],
      menu,
      { cookie: 2 },
    );
    expect(items[0].quantity).toBe(2);
    expect(unavailable).toBe(0); // clamped, not dropped
  });

  it("drops a line when no stock is left", () => {
    const { items, unavailable } = reconcileReorder(
      [{ menuItemId: "cookie", quantity: 1 }],
      menu,
      { cookie: 0 },
    );
    expect(items).toEqual([]);
    expect(unavailable).toBe(1);
  });

  it("pools stock across earlier lines of the same item", () => {
    // Two oat lattes requested, only 1 in stock → second clamped to 0 → dropped.
    const lines: ReorderLine[] = [
      {
        menuItemId: "latte",
        quantity: 1,
        options: [{ group: "Milk", choice: "Oat" }],
      },
      {
        menuItemId: "latte",
        quantity: 1,
        options: [{ group: "Milk", choice: "Soy" }],
      },
    ];
    const { items, unavailable } = reconcileReorder(lines, menu, { latte: 1 });
    const total = items.reduce((n, i) => n + i.quantity, 0);
    expect(total).toBe(1);
    expect(unavailable).toBe(1);
  });

  it("ignores non-positive or non-finite quantities", () => {
    const { items, unavailable } = reconcileReorder(
      [
        { menuItemId: "cookie", quantity: 0 },
        { menuItemId: "cookie", quantity: -3 },
        { menuItemId: "cookie", quantity: Number.NaN },
      ],
      menu,
    );
    expect(items).toEqual([]);
    expect(unavailable).toBe(3);
  });

  it("returns an empty cart when nothing survives", () => {
    const { items, unavailable } = reconcileReorder(
      [
        { menuItemId: "ghost", quantity: 1 },
        { menuItemId: "phantom", quantity: 2 },
      ],
      menu,
    );
    expect(items).toEqual([]);
    expect(unavailable).toBe(2);
  });
});
