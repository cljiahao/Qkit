import type { Plan } from "@/lib/types";

export type VendorRowLite = { plan: Plan; created_at: string };
export type EventRowLite = { type: string; created_at: string };

export type VendorSummary = {
  total: number;
  free: number;
  pro: number;
  new7d: number;
  new30d: number;
};

export type EventSummary = {
  total: number;
  byType: Record<string, number>;
  last7dByType: Record<string, number>;
};

const DAY = 86_400_000;

function withinDays(createdAt: string, nowMs: number, days: number): boolean {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && nowMs - t <= days * DAY;
}

/** Aggregate vendor rows into plan counts + recent signups. Pure. */
export function summarizeVendors(
  rows: VendorRowLite[],
  nowMs: number,
): VendorSummary {
  let free = 0;
  let pro = 0;
  let new7d = 0;
  let new30d = 0;
  for (const r of rows) {
    if (r.plan === "pro") pro++;
    else free++;
    if (withinDays(r.created_at, nowMs, 7)) new7d++;
    if (withinDays(r.created_at, nowMs, 30)) new30d++;
  }
  return { total: rows.length, free, pro, new7d, new30d };
}

/** Aggregate event rows by type, overall and within the last 7 days. Pure. */
export function summarizeEvents(
  rows: EventRowLite[],
  nowMs: number,
): EventSummary {
  const byType: Record<string, number> = {};
  const last7dByType: Record<string, number> = {};
  for (const r of rows) {
    byType[r.type] = (byType[r.type] ?? 0) + 1;
    if (withinDays(r.created_at, nowMs, 7)) {
      last7dByType[r.type] = (last7dByType[r.type] ?? 0) + 1;
    }
  }
  return { total: rows.length, byType, last7dByType };
}
