import type { PaymentConfig } from "@/lib/types";
import { buildPayNowPayload } from "./paynow";

// What the customer's Pay panel renders. `qr` carries an EMVCo string the
// client turns into a QR; `link`/`image` point at a vendor-hosted destination.
export type CheckoutView =
  | { type: "qr"; payload: string }
  | { type: "link"; url: string; label: string }
  | { type: "image"; url: string };

export function renderCheckout(
  config: PaymentConfig,
  ctx: { amountCents: number; orderRef: string },
): CheckoutView {
  switch (config.kind) {
    case "pointer":
      if (config.url)
        return { type: "link", url: config.url, label: config.label };
      // Schema guarantees one of url / qr_image_url is present.
      return { type: "image", url: config.qr_image_url! };
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
      throw new Error("stripe payments not enabled");
  }
}
