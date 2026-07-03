import type { Plan } from "@/lib/types";
import { MS_PER_DAY } from "@/lib/utils";

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

export type ActivationFunnel = {
  signedUp: number; // vendors
  withBooth: number; // vendors with ≥1 booth
  withOrder: number; // vendors with ≥1 order
  pro: number; // vendors on the Pro plan
};

/**
 * Vendor activation funnel: signed up → created a booth → took an order →
 * upgraded to Pro. Counts DISTINCT vendors at each stage (a vendor with two
 * booths counts once). Foreign booth/order rows (no matching vendor) are
 * ignored. Pure: no DB.
 */
export function activationFunnel(
  vendors: { id: string; plan: Plan }[],
  booths: { id: string; vendor_id: string }[],
  orderBoothIds: string[],
): ActivationFunnel {
  const vendorIds = new Set(vendors.map((v) => v.id));
  const boothToVendor = new Map<string, string>();
  const withBooth = new Set<string>();
  for (const b of booths) {
    boothToVendor.set(b.id, b.vendor_id);
    if (vendorIds.has(b.vendor_id)) withBooth.add(b.vendor_id);
  }
  const withOrder = new Set<string>();
  for (const boothId of new Set(orderBoothIds)) {
    const vendorId = boothToVendor.get(boothId);
    if (vendorId && vendorIds.has(vendorId)) withOrder.add(vendorId);
  }
  return {
    signedUp: vendors.length,
    withBooth: withBooth.size,
    withOrder: withOrder.size,
    pro: vendors.filter((v) => v.plan === "pro").length,
  };
}

export type LicenseWindowLite = {
  vendor_id: string;
  valid_from: string;
  expires_at: string;
};

/**
 * Map each vendor to the expiry of their latest CURRENTLY-ACTIVE pass — in
 * window (valid_from <= now < expires_at), longest remaining wins. A
 * scheduled-future or already-expired pass is not "live" and is skipped.
 * Pure: no DB. Shared by the admin overview and vendors pages.
 */
export function latestActivePassByVendor(
  licenses: LicenseWindowLite[],
  nowMs: number,
): Map<string, string> {
  const byVendor = new Map<string, string>();
  for (const l of licenses) {
    if (Date.parse(l.valid_from) > nowMs || Date.parse(l.expires_at) <= nowMs)
      continue;
    const cur = byVendor.get(l.vendor_id);
    if (!cur || Date.parse(l.expires_at) > Date.parse(cur))
      byVendor.set(l.vendor_id, l.expires_at);
  }
  return byVendor;
}

function withinDays(createdAt: string, nowMs: number, days: number): boolean {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && nowMs - t <= days * MS_PER_DAY;
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
