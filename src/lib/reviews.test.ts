import { describe, it, expect } from "vitest";
import {
  summarizeReviews,
  groupReviewsByBooth,
  type ReviewRow,
} from "./reviews";

function row(
  rating: number | null,
  created_at: string,
  message: string | null = null,
  booth_id: string | null = null,
): ReviewRow {
  return { rating, message, order_number: null, booth_id, created_at };
}

describe("summarizeReviews", () => {
  it("returns a null average for no rated rows", () => {
    const s = summarizeReviews([]);
    expect(s.count).toBe(0);
    expect(s.average).toBeNull();
    expect(s.recent).toEqual([]);
  });

  it("averages ratings to one decimal place", () => {
    const s = summarizeReviews([
      row(5, "2026-06-10T00:00:00Z"),
      row(4, "2026-06-11T00:00:00Z"),
      row(4, "2026-06-12T00:00:00Z"),
    ]);
    expect(s.count).toBe(3);
    expect(s.average).toBeCloseTo(4.3, 1); // 13/3 = 4.33 → 4.3
  });

  it("counts the star distribution", () => {
    const s = summarizeReviews([
      row(5, "2026-06-10T00:00:00Z"),
      row(5, "2026-06-11T00:00:00Z"),
      row(3, "2026-06-12T00:00:00Z"),
    ]);
    expect(s.distribution[5]).toBe(2);
    expect(s.distribution[3]).toBe(1);
    expect(s.distribution[1]).toBe(0);
  });

  it("ignores out-of-range ratings in the average", () => {
    const s = summarizeReviews([
      row(5, "2026-06-10T00:00:00Z"),
      row(0, "2026-06-11T00:00:00Z"),
      row(9, "2026-06-12T00:00:00Z"),
    ]);
    expect(s.count).toBe(1);
    expect(s.average).toBe(5);
  });

  it("returns recent comments newest-first, capped", () => {
    const s = summarizeReviews(
      [
        row(5, "2026-06-10T00:00:00Z", "great"),
        row(4, "2026-06-12T00:00:00Z", "good"),
        row(3, "2026-06-11T00:00:00Z", "ok"),
      ],
      2,
    );
    expect(s.recent.map((r) => r.message)).toEqual(["good", "ok"]);
  });

  it("includes rating-only rows (no message) in recent", () => {
    const s = summarizeReviews([row(5, "2026-06-10T00:00:00Z", null)]);
    expect(s.recent).toHaveLength(1);
  });
});

describe("groupReviewsByBooth", () => {
  const booths = [
    { id: "a", name: "Booth A" },
    { id: "b", name: "Booth B" },
  ];

  it("splits reviews per booth, preserving booth order", () => {
    const groups = groupReviewsByBooth(
      [
        row(5, "2026-06-10T00:00:00Z", "a1", "a"),
        row(3, "2026-06-11T00:00:00Z", "b1", "b"),
        row(4, "2026-06-12T00:00:00Z", "a2", "a"),
      ],
      booths,
    );
    expect(groups.map((g) => g.boothId)).toEqual(["a", "b"]);
    expect(groups[0].summary.count).toBe(2);
    expect(groups[0].summary.average).toBe(4.5);
    expect(groups[1].summary.count).toBe(1);
  });

  it("omits booths with no reviews", () => {
    const groups = groupReviewsByBooth(
      [row(5, "2026-06-10T00:00:00Z", "a1", "a")],
      booths,
    );
    expect(groups.map((g) => g.boothId)).toEqual(["a"]);
  });

  it("ignores rows whose booth isn't in the list (and null booth_id)", () => {
    const groups = groupReviewsByBooth(
      [
        row(5, "2026-06-10T00:00:00Z", "x", "ghost"),
        row(4, "2026-06-10T00:00:00Z", "y", null),
      ],
      booths,
    );
    expect(groups).toEqual([]);
  });
});
