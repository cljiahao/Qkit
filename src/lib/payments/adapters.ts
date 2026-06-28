import type { PaymentConfig } from "@/lib/types";
import { buildPayNowPayload } from "./paynow";

// What the customer's Pay panel renders. `qr` carries an EMVCo string the
// client turns into a QR; `link`/`image` point at a vendor-hosted destination.
export type CheckoutView =
  | { type: "qr"; payload: string }
  | { type: "link"; url: string; label: string }
  | { type: "image"; url: string };

// Returns null for kinds that can't render a customer checkout (the reserved-
// but-dark 'stripe', or a pointer missing both destinations) — callers treat
// null as "no pay panel". No throw, so no try/catch at the call site.
export function renderCheckout(
  config: PaymentConfig,
  ctx: { amountCents: number; orderRef: string },
): CheckoutView | null {
  switch (config.kind) {
    case "pointer":
      if (config.url)
        return { type: "link", url: config.url, label: config.label };
      if (config.qr_image_url)
        return { type: "image", url: config.qr_image_url };
      return null;
    case "paynow":
      return {
        type: "qr",
        payload: buildPayNowPayload({
          uen: config.uen,
          mobile: config.mobile,
          payeeName: config.payee_name,
          amountCents: ctx.amountCents,
          reference: ctx.orderRef,
        }),
      };
    case "stripe":
      return null;
  }
}
