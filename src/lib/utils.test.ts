import { describe, expect, it } from "vitest";
import {
  cn,
  formatOptions,
  formatPrice,
  genOrderNumber,
  orderHasPricing,
} from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("resolves tailwind conflicts — last wins", () => {
    expect(cn("p-4", "p-8")).toBe("p-8");
  });

  it("handles falsy values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
});

describe("formatPrice", () => {
  it("formats 1000 cents as SGD 10", () => {
    const result = formatPrice(1000);
    expect(result).toContain("10");
    expect(result).toContain("$");
  });

  it("formats 0 as $0", () => {
    expect(formatPrice(0)).toContain("0");
  });
});

describe("genOrderNumber", () => {
  it("pads single digit to 4 chars", () => {
    expect(genOrderNumber(0)).toBe("0001");
  });

  it("pads two digits correctly", () => {
    expect(genOrderNumber(9)).toBe("0010");
  });

  it("does not pad 4-digit count", () => {
    expect(genOrderNumber(9999)).toBe("10000");
  });
});

describe("orderHasPricing", () => {
  it("is true when any item has a price", () => {
    expect(
      orderHasPricing([{ price_cents: undefined }, { price_cents: 500 }]),
    ).toBe(true);
  });

  it("is false when no item has a price", () => {
    expect(orderHasPricing([{ price_cents: undefined }, {}])).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(orderHasPricing([])).toBe(false);
  });

  it("treats price_cents 0 as priced", () => {
    expect(orderHasPricing([{ price_cents: 0 }])).toBe(true);
  });
});

describe("formatOptions", () => {
  it("joins choices with a middot separator", () => {
    expect(formatOptions([{ choice: "Iced" }, { choice: "Less" }])).toBe(
      "Iced · Less",
    );
  });

  it("returns a single choice unchanged", () => {
    expect(formatOptions([{ choice: "Hot" }])).toBe("Hot");
  });

  it("is empty for no options", () => {
    expect(formatOptions([])).toBe("");
    expect(formatOptions(null)).toBe("");
    expect(formatOptions(undefined)).toBe("");
  });
});
