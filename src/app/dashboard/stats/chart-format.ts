// Shared formatting for the stats charts + KPI cards. Kept in one place so the
// trend / service-speed charts can't drift on range labels, and so the two
// wait renderings (compact axis vs readable KPI) live side by side.

/** Window label shown in a chart's eyebrow header. */
export const RANGE_LABEL: Record<string, string> = {
  "24h": "last 24 hours",
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
};

/** Compact wait — for chart axes + tooltips: "4.2m" / "45s". */
export function fmtWait(seconds: number): string {
  return seconds >= 60
    ? `${(seconds / 60).toFixed(1)}m`
    : `${Math.round(seconds)}s`;
}

/**
 * Readable wait — for KPI cards: "4m 12s" (or "12s" under a minute). Floors
 * minutes off the rounded total so it never over-rounds the minutes or shows a
 * "2m 60s" carry.
 */
export function waitClock(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
