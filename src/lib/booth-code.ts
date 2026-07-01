/**
 * Booth short-code helpers. The short code is the sole public capability in the
 * customer order URL; rotating it (regenerate) invalidates every printed QR.
 */
/** The customer order entry URL: `/o/{code}`. */
export function orderPath(code: string): string {
  return `/o/${encodeURIComponent(code)}`;
}
