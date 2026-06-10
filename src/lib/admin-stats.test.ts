import { describe, expect, it } from "vitest";
import { summarizeEvents, summarizeVendors } from "./admin-stats";

const NOW = Date.parse("2026-06-11T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe("summarizeVendors", () => {
  it("counts plans and recent signups", () => {
    const s = summarizeVendors(
      [
        { plan: "pro", created_at: daysAgo(1) },
        { plan: "free", created_at: daysAgo(3) },
        { plan: "free", created_at: daysAgo(10) },
        { plan: "free", created_at: daysAgo(40) },
      ],
      NOW,
    );
    expect(s.total).toBe(4);
    expect(s.pro).toBe(1);
    expect(s.free).toBe(3);
    expect(s.new7d).toBe(2); // 1d, 3d
    expect(s.new30d).toBe(3); // 1d, 3d, 10d
  });

  it("handles empty input", () => {
    expect(summarizeVendors([], NOW)).toEqual({
      total: 0,
      free: 0,
      pro: 0,
      new7d: 0,
      new30d: 0,
    });
  });
});

describe("summarizeEvents", () => {
  it("counts by type, overall and last 7 days", () => {
    const s = summarizeEvents(
      [
        { type: "landing_cta", created_at: daysAgo(1) },
        { type: "landing_cta", created_at: daysAgo(9) },
        { type: "upgrade_cta", created_at: daysAgo(2) },
      ],
      NOW,
    );
    expect(s.total).toBe(3);
    expect(s.byType).toEqual({ landing_cta: 2, upgrade_cta: 1 });
    expect(s.last7dByType).toEqual({ landing_cta: 1, upgrade_cta: 1 });
  });

  it("handles empty input", () => {
    expect(summarizeEvents([], NOW)).toEqual({
      total: 0,
      byType: {},
      last7dByType: {},
    });
  });
});
