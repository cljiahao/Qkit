import { describe, expect, it } from "vitest";
import { nearestIndex } from "./carousel";

describe("nearestIndex", () => {
  it("rounds to the nearest board", () => {
    expect(nearestIndex(0, 300, 4)).toBe(0);
    expect(nearestIndex(140, 300, 4)).toBe(0);
    expect(nearestIndex(160, 300, 4)).toBe(1);
    expect(nearestIndex(600, 300, 4)).toBe(2);
  });
  it("clamps to the last board", () => {
    expect(nearestIndex(99999, 300, 4)).toBe(3);
  });
  it("clamps to the first board on negative overscroll", () => {
    expect(nearestIndex(-50, 300, 4)).toBe(0);
  });
  it("returns 0 for a zero/negative board width", () => {
    expect(nearestIndex(500, 0, 4)).toBe(0);
    expect(nearestIndex(500, -10, 4)).toBe(0);
  });
});
