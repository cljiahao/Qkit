export type DowngradeOutcome = "not_found" | "already_free" | "downgrade";

/**
 * Whether to flip a vendor to free, treat this call as an idempotent no-op
 * (already free), or reject because the email didn't resolve to an actual
 * vendor. Pure — the route resolves both inputs via DB reads and just
 * carries the decision here.
 */
export function resolveDowngradeOutcome(
  hasVendorRow: boolean,
  currentPlan: "free" | "pro",
): DowngradeOutcome {
  if (!hasVendorRow) return "not_found";
  if (currentPlan === "free") return "already_free";
  return "downgrade";
}
