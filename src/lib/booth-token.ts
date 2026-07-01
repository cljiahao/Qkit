/**
 * Booth QR access-token helpers. The token is a rotatable, URL-borne capability
 * that gates the customer order entry page; regenerating it invalidates every
 * previously printed/saved QR for that booth. Pure functions only — shared by
 * the order page, the placeOrder action, and the QR poster (single source of
 * truth for the compare + URL shape).
 */

/**
 * True only when a non-empty provided token exactly matches a non-empty expected
 * token. Empty/absent on either side is always invalid — a booth with no token,
 * or a scan with no `k`, must hard-block (clean cutover).
 */
export function isTokenValid(
  expected: string | null | undefined,
  provided: string | null | undefined,
): boolean {
  if (!expected || !provided) return false;
  return expected === provided;
}

/** The customer order entry URL for a booth: `/order/{boothId}?k={token}`. */
export function orderPath(boothId: string, token: string): string {
  return `/order/${boothId}?k=${encodeURIComponent(token)}`;
}
