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

  it("maps each weekday correctly (2026-06-08 is Monday)", () => {
    // All at 04:00Z = 12:00 SGT, same calendar day.
    expect(sgtWeekday("2026-06-08T04:00:00Z")).toBe("mon");
    expect(sgtWeekday("2026-06-09T04:00:00Z")).toBe("tue");
    expect(sgtWeekday("2026-06-10T04:00:00Z")).toBe("wed");
    expect(sgtWeekday("2026-06-11T04:00:00Z")).toBe("thu");
    expect(sgtWeekday("2026-06-12T04:00:00Z")).toBe("fri");
    expect(sgtWeekday("2026-06-13T04:00:00Z")).toBe("sat");
    expect(sgtWeekday("2026-06-14T04:00:00Z")).toBe("sun");
  });

  it("reads an exact non-round hour and minute", () => {
    // 05:45Z -> 13:45 SGT
    expect(sgtHour("2026-06-12T05:45:00Z")).toBe(13);
    expect(sgtMinutes("2026-06-12T05:45:00Z")).toBe(13 * 60 + 45);
  });
});
