// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCart } from "./use-cart";
import { cartKey } from "@/lib/cart";
import type { MenuItem } from "@/lib/types";

const KOPI: MenuItem = {
  id: "m1",
  name: "Kopi",
  description: "",
  available: true,
  price_cents: 180,
};

const RAMEN: MenuItem = {
  id: "m2",
  name: "Ramen",
  description: "",
  available: true,
  price_cents: 1400,
  option_groups: [
    {
      id: "g1",
      label: "Spice",
      multiple: false,
      choices: [
        { id: "c1", label: "Mild" },
        { id: "c2", label: "Extra Spicy", price_delta_cents: 100 },
      ],
    },
  ],
};

const FREE: MenuItem = {
  id: "m3",
  name: "Water",
  description: "",
  available: true,
};

const SPICY = [{ group: "Spice", choice: "Extra Spicy" }];
const MILD = [{ group: "Spice", choice: "Mild" }];

describe("useCart", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useCart());
    expect(result.current.items).toEqual([]);
    expect(result.current.entries).toEqual([]);
  });

  it("adds a plain item as one line", () => {
    const { result } = renderHook(() => useCart());
    act(() => result.current.add(KOPI, []));
    expect(result.current.items).toEqual([
      { menuItemId: "m1", name: "Kopi", price_cents: 180, quantity: 1 },
    ]);
  });

  it("adds the same item again as one more, not a second line", () => {
    const { result } = renderHook(() => useCart());
    act(() => result.current.add(KOPI, []));
    act(() => result.current.add(KOPI, []));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(2);
  });

  it("keeps different options of one item on separate lines", () => {
    const { result } = renderHook(() => useCart());
    act(() => result.current.add(RAMEN, SPICY));
    act(() => result.current.add(RAMEN, MILD));
    expect(result.current.items).toHaveLength(2);
    expect(result.current.cart.has(cartKey("m2", SPICY))).toBe(true);
    expect(result.current.cart.has(cartKey("m2", MILD))).toBe(true);
  });

  it("folds a chosen option's price into the line", () => {
    const { result } = renderHook(() => useCart());
    act(() => result.current.add(RAMEN, SPICY));
    expect(result.current.items[0]).toMatchObject({
      price_cents: 1500,
      options: SPICY,
    });
  });

  it("leaves an unpriced item unpriced, so it still reads as free", () => {
    const { result } = renderHook(() => useCart());
    act(() => result.current.add(FREE, []));
    expect(result.current.items[0].price_cents).toBeUndefined();
    expect(result.current.items[0].options).toBeUndefined();
  });

  it("increments and decrements a line by its key", () => {
    const { result } = renderHook(() => useCart());
    act(() => result.current.add(KOPI, []));
    const key = cartKey("m1");
    act(() => result.current.increment(key));
    expect(result.current.items[0].quantity).toBe(2);
    act(() => result.current.decrement(key));
    expect(result.current.items[0].quantity).toBe(1);
  });

  it("removes a line when its last one is taken away", () => {
    const { result } = renderHook(() => useCart());
    act(() => result.current.add(KOPI, []));
    act(() => result.current.decrement(cartKey("m1")));
    expect(result.current.items).toEqual([]);
  });

  it("ignores a key that is not in the basket, without a re-render", () => {
    const { result } = renderHook(() => useCart());
    act(() => result.current.add(KOPI, []));
    const before = result.current.cart;
    act(() => result.current.increment("nope"));
    act(() => result.current.decrement("nope"));
    expect(result.current.cart).toBe(before);
  });

  it("lets the caller replace the basket wholesale", () => {
    const { result } = renderHook(() => useCart());
    act(() => result.current.add(KOPI, []));
    act(() => result.current.setCart(new Map()));
    expect(result.current.items).toEqual([]);
  });
});
