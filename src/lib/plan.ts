import type { Plan } from "@/lib/types";

export type { Plan };

export const PLAN_LIMITS: Record<
  Plan,
  { maxBooths: number; statsRanges: readonly string[] }
> = {
  free: { maxBooths: 1, statsRanges: ["24h"] },
  pro: { maxBooths: Infinity, statsRanges: ["24h", "7d", "30d"] },
};

/**
 * Coerce an untrusted plan value to a known Plan. Anything that isn't exactly
 * "pro" (including undefined when the `plan` column predates migration 0003)
 * degrades to "free", so gating never crashes.
 */
export function normalizePlan(value: unknown): Plan {
  return value === "pro" ? "pro" : "free";
}

export function canAddBooth(plan: Plan, currentBoothCount: number): boolean {
  return currentBoothCount < PLAN_LIMITS[plan].maxBooths;
}

export function allowedStatsRanges(plan: Plan): readonly string[] {
  return PLAN_LIMITS[plan].statsRanges;
}
