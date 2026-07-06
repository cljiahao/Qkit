import { describe, expect, it } from "vitest";
import { parseRemaining, remainingFor } from "./stock";

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
