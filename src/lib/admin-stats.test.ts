import { describe, expect, it } from "vitest";
import {
  activationFunnel,
  latestActivePassByVendor,
  summarizeEvents,
  summarizeVendors,
} from "./admin-stats";
import type { Plan } from "@/lib/types";

const NOW = Date.parse("2026-06-11T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

describe("latestActivePassByVendor", () => {
  it("keeps only in-window passes and picks the longest-remaining per vendor", () => {
    const m = latestActivePassByVendor(
      [
        // vendor a: two live passes — the later expiry wins
        { vendor_id: "a", valid_from: daysAgo(1), expires_at: daysAhead(1) },
        { vendor_id: "a", valid_from: daysAgo(2), expires_at: daysAhead(5) },
        // vendor b: expired — excluded
        { vendor_id: "b", valid_from: daysAgo(10), expires_at: daysAgo(1) },
        // vendor c: scheduled future — not yet live, excluded
        { vendor_id: "c", valid_from: daysAhead(1), expires_at: daysAhead(3) },
      ],
      NOW,
    );
    expect(m.get("a")).toBe(daysAhead(5));
    expect(m.has("b")).toBe(false);
    expect(m.has("c")).toBe(false);
    expect(m.size).toBe(1);
  });

  it("treats expires_at == now as expired (half-open window)", () => {
    const nowIso = new Date(NOW).toISOString();
    const m = latestActivePassByVendor(
      [{ vendor_id: "a", valid_from: daysAgo(1), expires_at: nowIso }],
      NOW,
    );
    expect(m.has("a")).toBe(false);
  });

  it("returns an empty map for no licenses", () => {
    expect(latestActivePassByVendor([], NOW).size).toBe(0);
  });
});

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

  it("includes a signup exactly on the window boundary (<=)", () => {
    // Exactly 7 / 30 days ago must still count — guards the <= boundary.
    const s = summarizeVendors(
      [
        { plan: "free", created_at: daysAgo(7) },
        { plan: "free", created_at: daysAgo(30) },
      ],
      NOW,
    );
    expect(s.new7d).toBe(1); // the 7-day-old one
    expect(s.new30d).toBe(2); // both
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

describe("activationFunnel", () => {
  const v = (id: string, plan: Plan = "free") => ({ id, plan });

  it("counts distinct vendors at each stage", () => {
    const f = activationFunnel(
      [v("a"), v("b"), v("c", "pro"), v("d")],
      [
        { id: "b1", vendor_id: "a" },
        { id: "b2", vendor_id: "a" }, // a has two booths — counts once
        { id: "b3", vendor_id: "b" },
        { id: "b4", vendor_id: "c" },
      ],
      ["b1", "b1", "b4"], // orders on a's and c's booths
    );
    expect(f).toEqual({ signedUp: 4, withBooth: 3, withOrder: 2, pro: 1 });
  });

  it("ignores booths/orders with no matching vendor", () => {
    const f = activationFunnel(
      [v("a")],
      [{ id: "b1", vendor_id: "ghost" }],
      ["b1", "unknown-booth"],
    );
    expect(f).toEqual({ signedUp: 1, withBooth: 0, withOrder: 0, pro: 0 });
  });

  it("is all-zero (except signups) with no booths or orders", () => {
    const f = activationFunnel([v("a"), v("b")], [], []);
    expect(f).toEqual({ signedUp: 2, withBooth: 0, withOrder: 0, pro: 0 });
  });
});
