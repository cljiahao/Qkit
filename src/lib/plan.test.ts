import { describe, expect, it } from "vitest";
import { allowedStatsRanges, canAddBooth, normalizePlan } from "./plan";

describe("normalizePlan", () => {
  it("keeps pro", () => {
    expect(normalizePlan("pro")).toBe("pro");
  });

  it("maps free/unknown/undefined to free", () => {
    expect(normalizePlan("free")).toBe("free");
    expect(normalizePlan("enterprise")).toBe("free");
    expect(normalizePlan(undefined)).toBe("free");
    expect(normalizePlan(null)).toBe("free");
  });
});

describe("canAddBooth", () => {
  it("free: allowed at 0 booths, blocked at 1+", () => {
    expect(canAddBooth("free", 0)).toBe(true);
    expect(canAddBooth("free", 1)).toBe(false);
    expect(canAddBooth("free", 5)).toBe(false);
  });

  it("pro: always allowed", () => {
    expect(canAddBooth("pro", 0)).toBe(true);
    expect(canAddBooth("pro", 50)).toBe(true);
  });
});

describe("allowedStatsRanges", () => {
  it("free sees today only", () => {
    expect(allowedStatsRanges("free")).toEqual(["24h"]);
  });

  it("pro sees all ranges", () => {
    expect(allowedStatsRanges("pro")).toEqual(["24h", "7d", "30d", "90d"]);
  });
});
