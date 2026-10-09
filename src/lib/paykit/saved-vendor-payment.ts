import { getVendorConfig } from "./client";
import type { PaymentConfig } from "@/lib/types";

/**
 * The vendor's payment details as saved in paykit (the real editable fields),
 * or null when there are none or paykit's call degrades. Vendor-wide, not
 * per booth: both booth pages hand it to the Payment section so that picking
 * a method the vendor has already set up starts from these details.
 */
export async function savedVendorPayment(
  vendorId: string,
): Promise<PaymentConfig | null> {
  const result = await getVendorConfig(vendorId);
  if (!result.ok || !result.data.hasConfig) return null;

  const d = result.data;
  if (d.kind === "paynow")
    return {
      kind: "paynow",
      payee_name: d.payeeName ?? "",
      ...(d.uen ? { uen: d.uen } : {}),
      ...(d.mobile ? { mobile: d.mobile } : {}),
    };
  if (d.kind === "pointer")
    return {
      kind: "pointer",
      label: d.label ?? "",
      ...(d.url ? { url: d.url } : {}),
      ...(d.qrImageUrl ? { qr_image_url: d.qrImageUrl } : {}),
    };
  return null;
}
