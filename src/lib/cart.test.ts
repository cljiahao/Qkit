import { describe, expect, it } from "vitest";
import { cartKey, cartTotal } from "./cart";

describe("cartKey", () => {
  it("returns the bare id when there are no options", () => {
    expect(cartKey("kopi")).toBe("kopi");
    expect(cartKey("kopi", [])).toBe("kopi");
  });

  it("is stable regardless of option order", () => {
    const a = cartKey("kopi", [
      { group: "Temperature", choice: "Iced" },
      { group: "Sugar", choice: "Less" },
    ]);
    const b = cartKey("kopi", [
      { group: "Sugar", choice: "Less" },
      { group: "Temperature", choice: "Iced" },
    ]);
    expect(a).toBe(b);
  });

  it("differs when a choice differs", () => {
    const hot = cartKey("kopi", [{ group: "Temperature", choice: "Hot" }]);
    const iced = cartKey("kopi", [{ group: "Temperature", choice: "Iced" }]);
    expect(hot).not.toBe(iced);
  });

  it("differs by base id", () => {
    expect(cartKey("kopi")).not.toBe(cartKey("teh"));
  });

  it("is stable for multi-select picks within one group, any order", () => {
    const a = cartKey("burger", [
      { group: "Add-ons", choice: "Egg" },
      { group: "Add-ons", choice: "Cheese" },
    ]);
    const b = cartKey("burger", [
      { group: "Add-ons", choice: "Cheese" },
      { group: "Add-ons", choice: "Egg" },
    ]);
    expect(a).toBe(b);
  });

  it("differs when the multi-select set differs", () => {
    const both = cartKey("burger", [
      { group: "Add-ons", choice: "Egg" },
      { group: "Add-ons", choice: "Cheese" },
    ]);
    const one = cartKey("burger", [{ group: "Add-ons", choice: "Egg" }]);
    expect(both).not.toBe(one);
  });
});

describe("cartTotal", () => {
  it("is 0 for an empty cart", () => {
    expect(cartTotal([])).toBe(0);
  });

  it("sums price × quantity across lines", () => {
    expect(
      cartTotal([
        { price_cents: 350, quantity: 2 },
        { price_cents: 500, quantity: 1 },
      ]),
    ).toBe(1200);
  });

  it("treats missing/null prices as 0", () => {
    expect(
      cartTotal([
        { price_cents: null, quantity: 3 },
        { quantity: 2 },
        { price_cents: 250, quantity: 1 },
      ]),
    ).toBe(250);
  });
});
