import type { Plan } from "@/lib/types";

export type { Plan };

export type Tier = "free" | "pass" | "pro";

/**
 * A vendor's resolved capabilities. `null` on a cap means unlimited — `null`
 * (not Infinity) so the object serializes cleanly across the server→client
 * boundary for gating UI.
 */
export interface Entitlement {
  tier: Tier;
  maxBooths: number | null;
  maxMenuItems: number | null;
  maxOptionGroupsPerItem: number | null;
  autoCloseHours: boolean;
  stockCaps: boolean;
  statsRanges: readonly string[];
}

const FREE: Entitlement = {
  tier: "free",
  maxBooths: 1,
  maxMenuItems: 6,
  maxOptionGroupsPerItem: 3,
  autoCloseHours: false,
  stockCaps: false,
  statsRanges: ["24h"],
};

// A time-boxed pass unlocks all OPERATIONAL features for its window, but only
// the event's own (24h) stats — longitudinal trends stay the subscriber carrot.
const PASS: Entitlement = {
  tier: "pass",
  maxBooths: null,
  maxMenuItems: null,
  maxOptionGroupsPerItem: null,
  autoCloseHours: true,
  stockCaps: true,
  statsRanges: ["24h"],
};

const PRO: Entitlement = {
  tier: "pro",
  maxBooths: null,
  maxMenuItems: null,
  maxOptionGroupsPerItem: null,
  autoCloseHours: true,
  stockCaps: true,
  statsRanges: ["24h", "7d", "30d", "90d"],
};

export const ENTITLEMENTS: Record<Tier, Entitlement> = {
  free: FREE,
  pass: PASS,
  pro: PRO,
};

/**
 * Coerce an untrusted plan value to a known Plan. Anything that isn't exactly
 * "pro" (including undefined when the `plan` column predates migration 0003)
 * degrades to "free", so gating never crashes.
 */
export function normalizePlan(value: unknown): Plan {
  return value === "pro" ? "pro" : "free";
}

/**
 * Resolve a vendor's effective entitlement. Permanent pro (subscription/comp via
 * vendors.plan) outranks a time-boxed pass; an unexpired license grants the pass
 * tier; otherwise free. `licenseExpiresAt` is the vendor's latest-expiring
 * license expiry (ISO string) or null. Defensive: an unparseable expiry is
 * ignored.
 */
export function getEntitlement(
  plan: unknown,
  licenseExpiresAt: string | null,
  nowMs: number,
): Entitlement {
  if (normalizePlan(plan) === "pro") return PRO;
  if (licenseExpiresAt) {
    const expiresMs = Date.parse(licenseExpiresAt);
    if (Number.isFinite(expiresMs) && expiresMs > nowMs) return PASS;
  }
  return FREE;
}

export function canAddBooth(
  ent: Entitlement,
  currentBoothCount: number,
): boolean {
  return ent.maxBooths === null || currentBoothCount < ent.maxBooths;
}

export function canAddMenuItem(
  ent: Entitlement,
  currentItemCount: number,
): boolean {
  return ent.maxMenuItems === null || currentItemCount < ent.maxMenuItems;
}

/**
 * Whether a menu item may carry `count` option groups under this entitlement.
 * Used both to block saving and to disable the "add group" affordance.
 */
export function canHaveOptionGroups(ent: Entitlement, count: number): boolean {
  return (
    ent.maxOptionGroupsPerItem === null || count <= ent.maxOptionGroupsPerItem
  );
}
