import type { PaymentKind } from "@/lib/types";

/**
 * `booths.payment` holds only a `{kind}` marker. The full payment details
 * (payee, UEN, link, QR image) live in paykit, vendor-wide. The marker stays
 * because `qkit.place_order` and `qkit.place_walkup_order` read
 * `booths.payment->>'kind'` to decide whether a new order starts out owing
 * payment, and SQL has no way to ask paykit.
 *
 * Everything that reads or writes the marker goes through this file, so the
 * app cannot disagree with itself about what a stored value means.
 */

/**
 * The kind stored on a booth, or null for a booth with no payment set up or
 * a value that is not a marker at all. Reads only the discriminant: the
 * full-config parser would reject a bare marker and report every configured
 * booth as taking no payment.
 */
export function paymentKindOf(data: unknown): PaymentKind | null {
  const kind = (data as { kind?: unknown } | null)?.kind;
  return kind === "paynow" || kind === "pointer" || kind === "stripe"
    ? kind
    : null;
}

/**
 * Whether orders at a booth of this kind start out owing payment. `stripe`
 * is reserved but dark, and counts as no payment, the same rule
 * `place_walkup_order` applies.
 */
export function expectsPayment(kind: PaymentKind | null): boolean {
  return kind !== null && kind !== "stripe";
}

/**
 * The marker to store for a booth saved with this kind, or null for no
 * payment. `stripe` cannot be chosen in the form and is stored as none.
 */
export function paymentMarker(
  kind: PaymentKind | undefined,
): { kind: PaymentKind } | null {
  return kind === "paynow" || kind === "pointer" ? { kind } : null;
}
