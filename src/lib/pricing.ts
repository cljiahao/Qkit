import type { Pricing } from "@/lib/types";

/** Shape the offer page + admin form consume (subset of the `pricing` row). */
export type PricingConfig = Pick<
  Pricing,
  "event_pass_cents" | "monthly_cents" | "currency"
>;

/**
 * Fallback when the `pricing` row can't be read (e.g. pre-migration). Zeroed so
 * the offer page renders without throwing; admins set real prices in /admin.
 */
export const DEFAULT_PRICING: PricingConfig = {
  event_pass_cents: 0,
  monthly_cents: 0,
  currency: "SGD",
};
