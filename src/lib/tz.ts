// QKit is Singapore-only, so every wall-clock decision (working hours, busiest
// hour) is made in Asia/Singapore — never the server's UTC or the customer's
// browser tz. Per-booth timezones are a future extension.
export const BOOTH_TZ = "Asia/Singapore";

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const WEEKDAY_MAP: Record<string, WeekdayKey> = {
  Sun: "sun",
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
};

// Options are constant, so build the formatter once. Intl.DateTimeFormat
// construction is comparatively expensive and sgtParts runs per order on the
// stats hot path.
const SGT_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: BOOTH_TZ,
  hourCycle: "h23", // 00–23; avoids the "24:00" some engines emit at midnight
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});

function sgtParts(iso: string): {
  hour: number;
  minute: number;
  weekday: WeekdayKey;
} {
  const map: Record<string, string> = {};
  for (const p of SGT_FORMAT.formatToParts(new Date(iso)))
    map[p.type] = p.value;
  return {
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: WEEKDAY_MAP[map.weekday] ?? "mon",
  };
}

/** Hour-of-day (0–23) of an ISO instant, in SGT. */
export function sgtHour(iso: string): number {
  return sgtParts(iso).hour;
}

/** Minutes since midnight (0–1439) of an ISO instant, in SGT. */
export function sgtMinutes(iso: string): number {
  const { hour, minute } = sgtParts(iso);
  return hour * 60 + minute;
}

/** Weekday key ("mon".."sun") of an ISO instant, in SGT. */
export function sgtWeekday(iso: string): WeekdayKey {
  return sgtParts(iso).weekday;
}

// Cached: short calendar date in SGT, e.g. "7 Jun" — used for chart axis ticks.
const SGT_DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: BOOTH_TZ,
  day: "numeric",
  month: "short",
});

/** Format an epoch-ms instant as a short SGT date like "7 Jun". */
export function shortDay(ms: number): string {
  return SGT_DAY_FORMAT.format(new Date(ms));
}
