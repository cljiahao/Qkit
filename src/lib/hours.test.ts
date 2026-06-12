import { describe, it, expect } from "vitest";
import { isBoothOpen, nextOpenLabel, type BoothHours } from "./hours";

// 2026-06-12 is Friday. SGT = UTC+8.
// Helpers: SGT 12:00 = 04:00Z (Fri); SGT 09:00 = 01:00Z; SGT 23:00 = 15:00Z;
// SGT 01:00 = 17:00Z (prev UTC day); Sat 12:00 SGT = 2026-06-13T04:00:00Z.

describe("isBoothOpen", () => {
  it("inactive is always closed, even with no hours", () => {
    expect(
      isBoothOpen({ is_active: false, hours: null }, "2026-06-12T04:00:00Z"),
    ).toBe(false);
  });

  it("no hours + active = open", () => {
    expect(
      isBoothOpen({ is_active: true, hours: null }, "2026-06-12T04:00:00Z"),
    ).toBe(true);
  });

  it("daily window: open inside, closed outside (close exclusive)", () => {
    const hours: BoothHours = { mode: "daily", open: "10:00", close: "18:00" };
    expect(
      isBoothOpen({ is_active: true, hours }, "2026-06-12T04:00:00Z"),
    ).toBe(true); // 12:00
    expect(
      isBoothOpen({ is_active: true, hours }, "2026-06-12T01:00:00Z"),
    ).toBe(false); // 09:00
    expect(
      isBoothOpen({ is_active: true, hours }, "2026-06-12T10:00:00Z"),
    ).toBe(false); // 18:00 exact
  });

  it("overnight daily window wraps midnight", () => {
    const hours: BoothHours = { mode: "daily", open: "18:00", close: "02:00" };
    expect(
      isBoothOpen({ is_active: true, hours }, "2026-06-12T15:00:00Z"),
    ).toBe(true); // 23:00
    expect(
      isBoothOpen({ is_active: true, hours }, "2026-06-12T17:00:00Z"),
    ).toBe(true); // 01:00
    expect(
      isBoothOpen({ is_active: true, hours }, "2026-06-12T04:00:00Z"),
    ).toBe(false); // 12:00
  });

  it("weekly: open on its day, closed on a null day", () => {
    const hours: BoothHours = {
      mode: "weekly",
      days: {
        mon: null,
        tue: null,
        wed: null,
        thu: null,
        fri: { open: "10:00", close: "18:00" },
        sat: null,
        sun: null,
      },
    };
    expect(
      isBoothOpen({ is_active: true, hours }, "2026-06-12T04:00:00Z"),
    ).toBe(true); // Fri 12:00
    expect(
      isBoothOpen({ is_active: true, hours }, "2026-06-13T04:00:00Z"),
    ).toBe(false); // Sat 12:00
  });

  it("daily degenerate window (open == close) is open all day", () => {
    const hours: BoothHours = { mode: "daily", open: "09:00", close: "09:00" };
    expect(
      isBoothOpen({ is_active: true, hours }, "2026-06-12T15:00:00Z"),
    ).toBe(true); // 23:00 — still open
  });
});

describe("nextOpenLabel", () => {
  // 2026-06-12T01:00:00Z = Fri 09:00 SGT; T10:00:00Z = Fri 18:00 SGT.
  it("returns null when inactive", () => {
    const hours: BoothHours = { mode: "daily", open: "10:00", close: "18:00" };
    expect(
      nextOpenLabel({ is_active: false, hours }, "2026-06-12T01:00:00Z"),
    ).toBeNull();
  });

  it("returns null when there are no hours", () => {
    expect(
      nextOpenLabel({ is_active: true, hours: null }, "2026-06-12T01:00:00Z"),
    ).toBeNull();
  });

  it("daily: announces today's open when still before it", () => {
    const hours: BoothHours = { mode: "daily", open: "10:00", close: "18:00" };
    expect(
      nextOpenLabel({ is_active: true, hours }, "2026-06-12T01:00:00Z"),
    ).toBe("Opens 10:00"); // Fri 09:00, opens 10:00
  });

  it("daily: after close, still announces the (next day's) open without a day label", () => {
    const hours: BoothHours = { mode: "daily", open: "10:00", close: "18:00" };
    expect(
      nextOpenLabel({ is_active: true, hours }, "2026-06-12T10:00:00Z"),
    ).toBe("Opens 10:00"); // Fri 18:00 — past today's open, next match is daily
  });

  it("weekly: names the next open day when today is closed", () => {
    const hours: BoothHours = {
      mode: "weekly",
      days: {
        mon: null,
        tue: null,
        wed: null,
        thu: null,
        fri: null,
        sat: { open: "11:00", close: "20:00" },
        sun: null,
      },
    };
    // Fri 09:00 SGT — closed today, next window is Saturday.
    expect(
      nextOpenLabel({ is_active: true, hours }, "2026-06-12T01:00:00Z"),
    ).toBe("Opens Sat 11:00");
  });

  it("weekly: before today's own window, announces today without a day label", () => {
    const hours: BoothHours = {
      mode: "weekly",
      days: {
        mon: null,
        tue: null,
        wed: null,
        thu: null,
        fri: { open: "10:00", close: "18:00" },
        sat: null,
        sun: null,
      },
    };
    expect(
      nextOpenLabel({ is_active: true, hours }, "2026-06-12T01:00:00Z"),
    ).toBe("Opens 10:00"); // Fri 09:00, today opens 10:00
  });

  it("weekly: returns null when no day has a window", () => {
    const hours: BoothHours = {
      mode: "weekly",
      days: {
        mon: null,
        tue: null,
        wed: null,
        thu: null,
        fri: null,
        sat: null,
        sun: null,
      },
    };
    expect(
      nextOpenLabel({ is_active: true, hours }, "2026-06-12T01:00:00Z"),
    ).toBeNull();
  });
});
