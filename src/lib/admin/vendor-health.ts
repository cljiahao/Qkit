import type { Plan } from "@/lib/types";
import { MS_PER_DAY, MS_PER_HOUR } from "@/lib/utils";

/**
 * Per-vendor health as a small set of banded statuses — not a synthetic 0-100
 * score. qkit has no login/engagement telemetry, so a numeric score from
 * order-recency alone would be false precision; a banded status the admin can
 * act on is more honest. First matching rule wins, most-urgent first.
 */
export type VendorStatus =
  // an open help request, or a billing inconsistency
  | "attention"
  // a live pass ends within 48h
  | "expiring"
  // onboarding stalled, or paying (Pro) with nothing to show
  | "stuck"
  // was active, gone silent
  | "quiet"
  // just signed up, still onboarding
  | "new"
  // took an order recently
  | "healthy";

export type VendorLite = {
  id: string;
  plan: Plan;
  created_at: string;
  /** Expiry of the vendor's latest CURRENTLY-live pass, or null (already live). */
  passExpiresAt: string | null;
};
export type BoothLite = { id: string; vendor_id: string; created_at: string };
export type OrderLite = {
  booth_id: string;
  status: string;
  created_at: string;
};

export type VendorHealthRow = {
  status: VendorStatus;
  orderCount: number;
  orders7d: number;
  lastOrderAt: string | null;
  boothCount: number;
};

const NEW_DAYS = 3;
const STUCK_DAYS = 3;
const QUIET_DAYS = 14;
const EXPIRING_MS = 48 * MS_PER_HOUR;

const RANK: Record<VendorStatus, number> = {
  attention: 0,
  expiring: 1,
  stuck: 2,
  quiet: 3,
  new: 4,
  healthy: 5,
};

/** Triage sort key for a status — lower is more urgent. */
export function statusRank(status: VendorStatus): number {
  return RANK[status];
}

/**
 * Whole hours remaining on a live pass, floored at 0; null when the vendor has
 * no currently-live pass. Shared by the admin vendor list and detail views.
 */
export function passHoursLeft(
  expiryIso: string | null | undefined,
  nowMs: number,
): number | null {
  if (!expiryIso) return null;
  return Math.max(0, Math.round((Date.parse(expiryIso) - nowMs) / MS_PER_HOUR));
}

type Signals = {
  plan: Plan;
  createdAt: string;
  passExpiresAt: string | null;
  boothCount: number;
  firstBoothAt: string | null;
  orderCount: number;
  lastOrderAt: string | null;
  hasOpenMessage: boolean;
};

function ageMs(iso: string, nowMs: number): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? nowMs - t : 0;
}

/** Classify one vendor from its rolled-up signals. First match wins. */
export function vendorStatus(s: Signals, nowMs: number): VendorStatus {
  if (s.hasOpenMessage) return "attention";

  if (s.passExpiresAt) {
    const left = Date.parse(s.passExpiresAt) - nowMs;
    if (left > 0 && left < EXPIRING_MS) return "expiring";
  }

  const signedUpAgo = ageMs(s.createdAt, nowMs);
  const boothAge = s.firstBoothAt ? ageMs(s.firstBoothAt, nowMs) : 0;
  if (
    (s.boothCount === 0 && signedUpAgo >= STUCK_DAYS * MS_PER_DAY) ||
    (s.orderCount === 0 && boothAge >= STUCK_DAYS * MS_PER_DAY) ||
    (s.plan === "pro" && s.orderCount === 0)
  ) {
    return "stuck";
  }

  if (
    s.lastOrderAt &&
    nowMs - Date.parse(s.lastOrderAt) <= QUIET_DAYS * MS_PER_DAY
  )
    return "healthy";

  if (signedUpAgo < NEW_DAYS * MS_PER_DAY) return "new";

  return "quiet";
}

/**
 * Roll raw admin-overview rows into a per-vendor health map. Pure: no DB, no
 * clock. Orders are keyed to their vendor via the booth map; cancelled orders
 * don't count as activity. O(booths + orders + vendors).
 */
export function buildVendorHealth(
  vendors: VendorLite[],
  booths: BoothLite[],
  orders: OrderLite[],
  openMessageVendorIds: Set<string>,
  nowMs: number,
): Map<string, VendorHealthRow> {
  const boothToVendor = new Map<string, string>();
  const boothCount = new Map<string, number>();
  const firstBoothAt = new Map<string, string>();
  for (const b of booths) {
    boothToVendor.set(b.id, b.vendor_id);
    boothCount.set(b.vendor_id, (boothCount.get(b.vendor_id) ?? 0) + 1);
    const cur = firstBoothAt.get(b.vendor_id);
    if (!cur || b.created_at < cur) firstBoothAt.set(b.vendor_id, b.created_at);
  }

  const cutoff7d = nowMs - 7 * MS_PER_DAY;
  const orderCount = new Map<string, number>();
  const orders7d = new Map<string, number>();
  const lastOrderAt = new Map<string, string>();
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const vid = boothToVendor.get(o.booth_id);
    if (!vid) continue;
    orderCount.set(vid, (orderCount.get(vid) ?? 0) + 1);
    if (Date.parse(o.created_at) >= cutoff7d)
      orders7d.set(vid, (orders7d.get(vid) ?? 0) + 1);
    const cur = lastOrderAt.get(vid);
    if (!cur || o.created_at > cur) lastOrderAt.set(vid, o.created_at);
  }

  const out = new Map<string, VendorHealthRow>();
  for (const v of vendors) {
    const count = orderCount.get(v.id) ?? 0;
    const last = lastOrderAt.get(v.id) ?? null;
    const status = vendorStatus(
      {
        plan: v.plan,
        createdAt: v.created_at,
        passExpiresAt: v.passExpiresAt,
        boothCount: boothCount.get(v.id) ?? 0,
        firstBoothAt: firstBoothAt.get(v.id) ?? null,
        orderCount: count,
        lastOrderAt: last,
        hasOpenMessage: openMessageVendorIds.has(v.id),
      },
      nowMs,
    );
    out.set(v.id, {
      status,
      orderCount: count,
      orders7d: orders7d.get(v.id) ?? 0,
      lastOrderAt: last,
      boothCount: boothCount.get(v.id) ?? 0,
    });
  }
  return out;
}
