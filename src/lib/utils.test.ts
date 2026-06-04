import { describe, expect, it } from "vitest";
import { cn, formatPrice, genOrderNumber } from "./utils";

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
  it("formats 1000 cents as MYR 10", () => {
    const result = formatPrice(1000);
    expect(result).toContain("10");
    expect(result).toContain("RM");
  });

  it("formats 0 as RM 0", () => {
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
