import { sgtMinutes, sgtWeekday, type WeekdayKey } from "@/lib/tz";

export type DayWindow = { open: string; close: string }; // "HH:MM"

// Discriminated so the editor can round-trip the vendor's chosen mode.
export type BoothHours =
  | null // no restriction — open whenever is_active
  | { mode: "daily"; open: string; close: string }
  | { mode: "weekly"; days: Record<WeekdayKey, DayWindow | null> }; // null day = closed

const ORDER: WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const DAY_LABEL: Record<WeekdayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/** True if nowMin falls in [open, close); a close <= open window wraps midnight. */
function inWindow(nowMin: number, open: string, close: string): boolean {
  const o = toMin(open);
  const c = toMin(close);
  if (o === c) return true; // degenerate window treated as open all day
  if (c > o) return nowMin >= o && nowMin < c;
  return nowMin >= o || nowMin < c; // overnight
}

function windowFor(hours: BoothHours, day: WeekdayKey): DayWindow | null {
  if (!hours) return null;
  if (hours.mode === "daily") return { open: hours.open, close: hours.close };
  return hours.days[day];
}

/**
 * Whether a booth accepts orders at the given instant. SGT wall-clock. Pure.
 * - inactive -> closed (hard gate)
 * - no hours -> open
 * - daily/weekly -> the matching window (overnight-aware; weekly null = closed)
 */
export function isBoothOpen(
  booth: { is_active: boolean; hours: BoothHours },
  nowIso: string,
): boolean {
  if (!booth.is_active) return false;
  if (!booth.hours) return true;
  const nowMin = sgtMinutes(nowIso);
  if (booth.hours.mode === "daily") {
    return inWindow(nowMin, booth.hours.open, booth.hours.close);
  }
  const day = booth.hours.days[sgtWeekday(nowIso)];
  return day ? inWindow(nowMin, day.open, day.close) : false;
}

/**
 * Short label for the customer "closed" banner, e.g. "Opens 10:00" or
 * "Opens Mon 10:00". Returns null when there is nothing useful to promise
 * (inactive, or no schedule). Call only when the booth is currently closed.
 */
export function nextOpenLabel(
  booth: { is_active: boolean; hours: BoothHours },
  nowIso: string,
): string | null {
  if (!booth.is_active || !booth.hours) return null;
  const nowMin = sgtMinutes(nowIso);
  const today = sgtWeekday(nowIso);

  const todayWindow = windowFor(booth.hours, today);
  if (todayWindow && nowMin < toMin(todayWindow.open)) {
    return `Opens ${todayWindow.open}`;
  }

  const startIdx = ORDER.indexOf(today);
  for (let i = 1; i <= 7; i++) {
    const day = ORDER[(startIdx + i) % 7];
    const w = windowFor(booth.hours, day);
    if (w) {
      return booth.hours.mode === "daily"
        ? `Opens ${w.open}`
        : `Opens ${DAY_LABEL[day]} ${w.open}`;
    }
  }
  return null;
}
