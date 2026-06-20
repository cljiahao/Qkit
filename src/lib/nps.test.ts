import { describe, it, expect } from "vitest";
import { npsBreakdown } from "./nps";

describe("npsBreakdown", () => {
  it("returns null score for no responses", () => {
    expect(npsBreakdown([])).toEqual({
      total: 0,
      promoters: 0,
      passives: 0,
      detractors: 0,
      score: null,
    });
  });

  it("buckets promoters (9-10), passives (7-8), detractors (0-6)", () => {
    const b = npsBreakdown([10, 9, 8, 7, 6, 0]);
    expect(b.promoters).toBe(2);
    expect(b.passives).toBe(2);
    expect(b.detractors).toBe(2);
    expect(b.total).toBe(6);
  });

  it("computes NPS = %promoters − %detractors, rounded", () => {
    // 2 promoters, 2 detractors of 6 → (33.3 − 33.3) = 0
    expect(npsBreakdown([10, 9, 8, 7, 6, 0]).score).toBe(0);
    // all promoters → 100
    expect(npsBreakdown([9, 10, 9]).score).toBe(100);
    // all detractors → -100
    expect(npsBreakdown([0, 3, 6]).score).toBe(-100);
    // 3 promoters, 1 detractor of 4 → (75 − 25) = 50
    expect(npsBreakdown([9, 9, 10, 0]).score).toBe(50);
  });

  it("ignores out-of-range / non-finite scores", () => {
    const b = npsBreakdown([9, 11, -1, Number.NaN, 5]);
    expect(b.total).toBe(2); // only 9 and 5 count
    expect(b.promoters).toBe(1);
    expect(b.detractors).toBe(1);
  });
});
