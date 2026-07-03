import {
  sgtMinutes,
  sgtWeekday,
  WEEKDAY_ORDER,
  WEEKDAY_LABELS,
  type WeekdayKey,
} from "@/lib/tz";

export type DayWindow = { open: string; close: string }; // "HH:MM"

// Discriminated so the editor can round-trip the vendor's chosen mode.
export type BoothHours =
  | null // no restriction — open whenever is_active
  | { mode: "daily"; open: string; close: string }
  | { mode: "weekly"; days: Record<WeekdayKey, DayWindow | null> }; // null day = closed

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * Does a window that STARTS on its own day cover nowMin on that SAME day?
 * - normal (close > open): [open, close)
 * - overnight (close < open): [open, 24:00) — only the evening part; the
 *   after-midnight tail belongs to the NEXT day (see morningCarry)
 * - degenerate (open == close): open all day
 */
function eveningCovers(win: DayWindow | null, nowMin: number): boolean {
  if (!win) return false;
  const o = toMin(win.open);
  const c = toMin(win.close);
  if (o === c) return true;
  if (c > o) return nowMin >= o && nowMin < c;
  return nowMin >= o;
}

/**
 * For an OVERNIGHT window on the PREVIOUS day, does its after-midnight tail
 * [00:00, close) cover nowMin this morning? Non-overnight windows don't carry.
 * This is what makes a weekly overnight shift (e.g. Fri 22:00–02:00) stay open
 * past midnight even when the next day has no window of its own.
 */
function morningCarry(win: DayWindow | null, nowMin: number): boolean {
  if (!win) return false;
  const o = toMin(win.open);
  const c = toMin(win.close);
  return c < o && nowMin < c;
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
    // Daily: every day carries the same window, so "yesterday" is that window too.
    const w = { open: booth.hours.open, close: booth.hours.close };
    return eveningCovers(w, nowMin) || morningCarry(w, nowMin);
  }
  const today = sgtWeekday(nowIso);
  const prev = WEEKDAY_ORDER[(WEEKDAY_ORDER.indexOf(today) + 6) % 7];
  return (
    eveningCovers(booth.hours.days[today], nowMin) ||
    morningCarry(booth.hours.days[prev], nowMin)
  );
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

  const startIdx = WEEKDAY_ORDER.indexOf(today);
  for (let i = 1; i <= 7; i++) {
    const day = WEEKDAY_ORDER[(startIdx + i) % 7];
    const w = windowFor(booth.hours, day);
    if (w) {
      return booth.hours.mode === "daily"
        ? `Opens ${w.open}`
        : `Opens ${WEEKDAY_LABELS[day]} ${w.open}`;
    }
  }
  return null;
}
