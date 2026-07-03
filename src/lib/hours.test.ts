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

  it("weekly overnight window carries past midnight into a null next day", () => {
    // Fri 22:00–02:00, Sat has no window of its own. The shift must still run to
    // Sat 02:00.
    const hours: BoothHours = {
      mode: "weekly",
      days: {
        mon: null,
        tue: null,
        wed: null,
        thu: null,
        fri: { open: "22:00", close: "02:00" },
        sat: null,
        sun: null,
      },
    };
    const open = (z: string) => isBoothOpen({ is_active: true, hours }, z);
    expect(open("2026-06-12T15:00:00Z")).toBe(true); // Fri 23:00, evening part
    expect(open("2026-06-12T17:00:00Z")).toBe(true); // Sat 01:00, carried from Fri
    expect(open("2026-06-12T19:00:00Z")).toBe(false); // Sat 03:00, past Fri's close
    expect(open("2026-06-13T04:00:00Z")).toBe(false); // Sat 12:00, Sat is null
    expect(open("2026-06-12T13:00:00Z")).toBe(false); // Fri 21:00, before open
  });

  it("weekly: a non-overnight window does NOT bleed into the next day", () => {
    // Fri 10:00–18:00 (normal). Sat 01:00 must be closed (no carry).
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
      isBoothOpen({ is_active: true, hours }, "2026-06-12T17:00:00Z"),
    ).toBe(false); // Sat 01:00
  });

  it("daily degenerate window (open == close) is open all day", () => {
    const hours: BoothHours = { mode: "daily", open: "09:00", close: "09:00" };
    expect(
      isBoothOpen({ is_active: true, hours }, "2026-06-12T15:00:00Z"),
    ).toBe(true); // 23:00 — still open
  });

  it("daily boundaries are open-inclusive, close-exclusive (with minutes)", () => {
    const hours: BoothHours = { mode: "daily", open: "09:30", close: "17:30" };
    const open = (z: string) => isBoothOpen({ is_active: true, hours }, z);
    expect(open("2026-06-12T01:29:00Z")).toBe(false); // 09:29 — before open
    expect(open("2026-06-12T01:30:00Z")).toBe(true); //  09:30 — open edge IS open
    expect(open("2026-06-12T09:29:00Z")).toBe(true); //  17:29 — last open minute
    expect(open("2026-06-12T09:30:00Z")).toBe(false); // 17:30 — close edge IS closed
  });

  it("overnight boundaries: open edge open, close edge closed", () => {
    const hours: BoothHours = { mode: "daily", open: "22:00", close: "06:00" };
    const open = (z: string) => isBoothOpen({ is_active: true, hours }, z);
    expect(open("2026-06-12T14:00:00Z")).toBe(true); //  22:00 — open edge
    expect(open("2026-06-11T21:59:00Z")).toBe(true); //  05:59 — last open minute
    expect(open("2026-06-11T22:00:00Z")).toBe(false); // 06:00 — close edge closed
  });
});

const CLOSED_WEEK = {
  mon: null,
  tue: null,
  wed: null,
  thu: null,
  fri: null,
  sat: null,
  sun: null,
} as const;

describe("nextOpenLabel weekly day labels", () => {
  // today = Fri 09:00 SGT; every listed day is closed today so the forward
  // scan reaches the single open day and must print its abbreviation.
  it.each([
    ["mon", "Mon"],
    ["tue", "Tue"],
    ["wed", "Wed"],
    ["thu", "Thu"],
    ["sun", "Sun"],
  ])("names %s as 'Opens %s 10:00'", (day, label) => {
    const hours: BoothHours = {
      mode: "weekly",
      days: { ...CLOSED_WEEK, [day]: { open: "10:00", close: "18:00" } },
    };
    expect(
      nextOpenLabel({ is_active: true, hours }, "2026-06-12T01:00:00Z"),
    ).toBe(`Opens ${label} 10:00`);
  });

  it("names Fri when today (Mon) is closed", () => {
    const hours: BoothHours = {
      mode: "weekly",
      days: { ...CLOSED_WEEK, fri: { open: "10:00", close: "18:00" } },
    };
    expect(
      nextOpenLabel({ is_active: true, hours }, "2026-06-08T01:00:00Z"),
    ).toBe("Opens Fri 10:00");
  });

  it("wraps a full week to the same day when it is the only one open", () => {
    // today = Fri 18:00, only Fri open 10:00–12:00 (already past) → next is Fri
    // next week (loop must reach i=7).
    const hours: BoothHours = {
      mode: "weekly",
      days: { ...CLOSED_WEEK, fri: { open: "10:00", close: "12:00" } },
    };
    expect(
      nextOpenLabel({ is_active: true, hours }, "2026-06-12T10:00:00Z"),
    ).toBe("Opens Fri 10:00");
  });

  it("after today's window closes, names a later open day (not today)", () => {
    // today = Fri 13:00, Fri window 10:00–12:00 already past, Sat opens 11:00.
    const hours: BoothHours = {
      mode: "weekly",
      days: {
        ...CLOSED_WEEK,
        fri: { open: "10:00", close: "12:00" },
        sat: { open: "11:00", close: "20:00" },
      },
    };
    expect(
      nextOpenLabel({ is_active: true, hours }, "2026-06-12T05:00:00Z"),
    ).toBe("Opens Sat 11:00");
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
