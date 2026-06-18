import { describe, expect, it } from "vitest";
import {
  canAddBooth,
  canAddMenuItem,
  canHaveOptionGroups,
  getEntitlement,
  normalizePlan,
  ENTITLEMENTS,
} from "./plan";

const NOW = Date.parse("2026-06-18T12:00:00Z");
const future = new Date(NOW + 60 * 60 * 1000).toISOString();
const past = new Date(NOW - 60 * 60 * 1000).toISOString();

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

describe("getEntitlement", () => {
  it("permanent pro outranks everything", () => {
    expect(getEntitlement("pro", null, NOW).tier).toBe("pro");
    // even with an expired license
    expect(getEntitlement("pro", past, NOW).tier).toBe("pro");
  });

  it("a live license grants the pass tier", () => {
    expect(getEntitlement("free", future, NOW).tier).toBe("pass");
  });

  it("an expired license falls back to free", () => {
    expect(getEntitlement("free", past, NOW).tier).toBe("free");
  });

  it("expiry boundary is exclusive (== now is expired)", () => {
    const exactly = new Date(NOW).toISOString();
    expect(getEntitlement("free", exactly, NOW).tier).toBe("free");
  });

  it("no license is free", () => {
    expect(getEntitlement("free", null, NOW).tier).toBe("free");
  });

  it("ignores an unparseable expiry", () => {
    expect(getEntitlement("free", "not-a-date", NOW).tier).toBe("free");
  });

  it("pass gets operational features but only 24h stats", () => {
    const pass = getEntitlement("free", future, NOW);
    expect(pass.autoCloseHours).toBe(true);
    expect(pass.stockCaps).toBe(true);
    expect(pass.maxBooths).toBeNull();
    expect(pass.statsRanges).toEqual(["24h"]);
  });

  it("pro gets full stats history", () => {
    expect(getEntitlement("pro", null, NOW).statsRanges).toEqual([
      "24h",
      "7d",
      "30d",
      "90d",
    ]);
  });
});

describe("canAddBooth", () => {
  it("free: allowed at 0 booths, blocked at 1+", () => {
    expect(canAddBooth(ENTITLEMENTS.free, 0)).toBe(true);
    expect(canAddBooth(ENTITLEMENTS.free, 1)).toBe(false);
    expect(canAddBooth(ENTITLEMENTS.free, 5)).toBe(false);
  });

  it("pass/pro: always allowed (unlimited)", () => {
    expect(canAddBooth(ENTITLEMENTS.pass, 50)).toBe(true);
    expect(canAddBooth(ENTITLEMENTS.pro, 50)).toBe(true);
  });
});

describe("canAddMenuItem", () => {
  it("free: blocked once at the 6-item cap", () => {
    expect(canAddMenuItem(ENTITLEMENTS.free, 5)).toBe(true);
    expect(canAddMenuItem(ENTITLEMENTS.free, 6)).toBe(false);
  });

  it("pro: unlimited", () => {
    expect(canAddMenuItem(ENTITLEMENTS.pro, 100)).toBe(true);
  });
});

describe("canHaveOptionGroups", () => {
  it("free: up to 3 groups, not 4", () => {
    expect(canHaveOptionGroups(ENTITLEMENTS.free, 3)).toBe(true);
    expect(canHaveOptionGroups(ENTITLEMENTS.free, 4)).toBe(false);
  });

  it("pro: unlimited", () => {
    expect(canHaveOptionGroups(ENTITLEMENTS.pro, 99)).toBe(true);
  });
});
