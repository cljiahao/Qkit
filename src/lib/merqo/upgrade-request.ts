export type UpgradeOutcome = "not_found" | "already_pending" | "create";

/**
 * Whether to create a new monthly upgrade request, treat this call as an
 * idempotent no-op (a pending one already exists), or reject because the
 * email didn't resolve to an actual vendor. Pure — the route resolves both
 * booleans via DB reads and just carries the decision here.
 */
export function resolveUpgradeOutcome(
  hasVendorRow: boolean,
  hasPendingRequest: boolean,
): UpgradeOutcome {
  if (!hasVendorRow) return "not_found";
  if (hasPendingRequest) return "already_pending";
  return "create";
}
