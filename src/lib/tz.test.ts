import { describe, it, expect } from "vitest";
import { sgtHour, sgtMinutes, sgtWeekday } from "./tz";

// SGT is UTC+8, no DST. 2026-06-12 is a Friday.
describe("tz (Asia/Singapore)", () => {
  it("converts a UTC instant to SGT hour/minute", () => {
    // 00:30Z -> 08:30 SGT
    expect(sgtHour("2026-06-12T00:30:00Z")).toBe(8);
    expect(sgtMinutes("2026-06-12T00:30:00Z")).toBe(8 * 60 + 30);
  });

  it("gives midnight as hour 0, not 24", () => {
    // 16:00Z -> 00:00 SGT (next calendar day)
    expect(sgtHour("2026-06-12T16:00:00Z")).toBe(0);
    expect(sgtMinutes("2026-06-12T16:00:00Z")).toBe(0);
  });

  it("rolls the weekday across UTC midnight", () => {
    // Fri 12:00 SGT (= 04:00Z Fri)
    expect(sgtWeekday("2026-06-12T04:00:00Z")).toBe("fri");
    // 17:00Z Fri -> 01:00 SGT Sat
    expect(sgtWeekday("2026-06-12T17:00:00Z")).toBe("sat");
    expect(sgtHour("2026-06-12T17:00:00Z")).toBe(1);
  });
});
