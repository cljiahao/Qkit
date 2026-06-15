import { describe, expect, it } from "vitest";
import {
  DEFAULT_WINDOW,
  dailyFromWeek,
  dailyHours,
  emptyWeek,
  weekFromDaily,
} from "./hours-editor";

describe("dailyHours", () => {
  it("builds a window when both ends are set", () => {
    expect(dailyHours("09:00", "17:00")).toEqual({
      mode: "daily",
      open: "09:00",
      close: "17:00",
    });
  });

  it("is null until both ends are present", () => {
    expect(dailyHours("", "")).toBeNull();
    expect(dailyHours("09:00", "")).toBeNull();
    expect(dailyHours("", "17:00")).toBeNull();
  });
});

describe("weekFromDaily", () => {
  it("prefills every day with the current daily window", () => {
    const week = weekFromDaily("08:00", "14:00");
    expect(Object.values(week)).toHaveLength(7);
    expect(week.mon).toEqual({ open: "08:00", close: "14:00" });
    expect(week.sun).toEqual({ open: "08:00", close: "14:00" });
  });

  it("falls back to the default window when daily was blank", () => {
    const week = weekFromDaily("", "");
    expect(week.wed).toEqual(DEFAULT_WINDOW);
  });
});

describe("dailyFromWeek", () => {
  it("collapses to the first set day's window", () => {
    const week = { ...emptyWeek(), thu: { open: "10:00", close: "20:00" } };
    expect(dailyFromWeek(week, "", "")).toEqual({
      open: "10:00",
      close: "20:00",
    });
  });

  it("prefers the earliest weekday when several are set", () => {
    const week = {
      ...emptyWeek(),
      tue: { open: "06:00", close: "12:00" },
      fri: { open: "18:00", close: "23:00" },
    };
    expect(dailyFromWeek(week, "", "")).toEqual({
      open: "06:00",
      close: "12:00",
    });
  });

  it("falls back to the prior daily values when every day is closed", () => {
    expect(dailyFromWeek(emptyWeek(), "07:30", "15:30")).toEqual({
      open: "07:30",
      close: "15:30",
    });
  });
});
