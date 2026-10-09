import { describe, expect, it } from "vitest";
import { cartKey, cartTotal, sumOptionDeltas } from "./cart";

describe("cartKey", () => {
  it("uses the same item identity for absent and empty options", () => {
    expect(cartKey("kopi")).toBe(cartKey("kopi", []));
    expect(cartKey("kopi")).not.toBe(cartKey("teh"));
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

  it("preserves boundaries when labels contain the old separator", () => {
    const separator = String.fromCharCode(31);
    const first = [{ group: `Milk${separator}Oat`, choice: "Large" }];
    const second = [{ group: "Milk", choice: `Oat${separator}Large` }];
    expect(cartKey("kopi", first)).not.toBe(cartKey("kopi", second));
  });

  it("distinguishes one label pair from several pairs", () => {
    const separator = String.fromCharCode(31);
    expect(
      cartKey("kopi", [{ group: "A", choice: `B${separator}C${separator}D` }]),
    ).not.toBe(
      cartKey("kopi", [
        { group: "A", choice: "B" },
        { group: "C", choice: "D" },
      ]),
    );
  });

  it("keeps a plain item ID distinct from an encoded configured-item key", () => {
    const configured = cartKey("kopi", [{ group: "Milk", choice: "Oat" }]);
    expect(cartKey(configured)).not.toBe(configured);
  });

  it("sorts distinct Unicode labels deterministically without mutating input", () => {
    const options = [
      { group: "\u00e9", choice: "A" },
      { group: "e\u0301", choice: "A" },
    ];
    const original = structuredClone(options);
    expect(cartKey("kopi", options)).toBe(
      cartKey("kopi", [...options].reverse()),
    );
    expect(options).toEqual(original);
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

describe("sumOptionDeltas", () => {
  const item = {
    option_groups: [
      {
        id: "milk",
        label: "Milk",
        choices: [
          { id: "reg", label: "Regular" },
          { id: "oat", label: "Oat Milk", price_delta_cents: 100 },
        ],
      },
      {
        id: "addons",
        label: "Add-ons",
        multiple: true,
        choices: [
          { id: "shot", label: "Extra Shot", price_delta_cents: 80 },
          { id: "syrup", label: "Syrup", price_delta_cents: 50 },
        ],
      },
    ],
  };

  it("is 0 with no options selected", () => {
    expect(sumOptionDeltas(item, [])).toBe(0);
    expect(sumOptionDeltas(item, undefined)).toBe(0);
  });

  it("is 0 for a selected choice with no delta", () => {
    expect(sumOptionDeltas(item, [{ group: "Milk", choice: "Regular" }])).toBe(
      0,
    );
  });

  it("sums a single priced choice", () => {
    expect(sumOptionDeltas(item, [{ group: "Milk", choice: "Oat Milk" }])).toBe(
      100,
    );
  });

  it("sums multiple selected choices across groups (multi-select)", () => {
    expect(
      sumOptionDeltas(item, [
        { group: "Milk", choice: "Oat Milk" },
        { group: "Add-ons", choice: "Extra Shot" },
        { group: "Add-ons", choice: "Syrup" },
      ]),
    ).toBe(230);
  });

  it("ignores an option that doesn't match any known group/choice", () => {
    expect(sumOptionDeltas(item, [{ group: "Nope", choice: "Nothing" }])).toBe(
      0,
    );
  });
});
