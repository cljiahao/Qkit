import { describe, expect, it } from "vitest";
import {
  hasOverStock,
  isSoldOut,
  overStockLines,
  parseRemaining,
  remainingFor,
} from "./stock";

describe("parseRemaining", () => {
  it("keeps numeric entries, floors negatives at 0", () => {
    expect(parseRemaining({ a: 3, b: 0, c: -2 })).toEqual({ a: 3, b: 0, c: 0 });
  });

  it("drops non-numeric and non-object input", () => {
    expect(parseRemaining({ a: "x", b: null, c: 5 })).toEqual({ c: 5 });
    expect(parseRemaining(null)).toEqual({});
    expect(parseRemaining([1, 2])).toEqual({});
    expect(parseRemaining("nope")).toEqual({});
  });
});

describe("remainingFor", () => {
  it("returns the cap for a capped item, null for an uncapped one", () => {
    const r = { a: 2 };
    expect(remainingFor(r, "a")).toBe(2);
    expect(remainingFor(r, "b")).toBeNull();
  });

  it("returns 0 (not null) for a depleted capped item", () => {
    expect(remainingFor({ a: 0 }, "a")).toBe(0);
  });
});

describe("isSoldOut", () => {
  it("sold out only when a capped item hits 0", () => {
    expect(isSoldOut({ a: 0 }, "a")).toBe(true);
    expect(isSoldOut({ a: 1 }, "a")).toBe(false);
    expect(isSoldOut({}, "a")).toBe(false); // uncapped never sold out
  });
});

describe("overStockLines", () => {
  it("flags lines exceeding the cap, ignores uncapped items", () => {
    const remaining = { a: 2 };
    expect(
      overStockLines([{ menuItemId: "a", quantity: 3 }], remaining),
    ).toEqual(["a"]);
    expect(
      overStockLines([{ menuItemId: "a", quantity: 2 }], remaining),
    ).toEqual([]);
    expect(
      overStockLines([{ menuItemId: "b", quantity: 99 }], remaining),
    ).toEqual([]);
  });

  it("aggregates quantity across option-variant lines of the same item", () => {
    const remaining = { a: 3 };
    const lines = [
      { menuItemId: "a", quantity: 2 },
      { menuItemId: "a", quantity: 2 },
    ];
    expect(overStockLines(lines, remaining)).toEqual(["a"]);
  });
});

describe("hasOverStock", () => {
  it("is true iff some line is over", () => {
    expect(hasOverStock([{ menuItemId: "a", quantity: 5 }], { a: 1 })).toBe(
      true,
    );
    expect(hasOverStock([{ menuItemId: "a", quantity: 1 }], { a: 1 })).toBe(
      false,
    );
  });
});
