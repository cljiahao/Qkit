import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import {
  parseMenuItems,
  parseBoothHours,
  parseSocialLinks,
} from "@/lib/schemas";
import {
  getVendorConfig,
  getBookingStatus,
  type BookingStatus,
} from "@/lib/paykit/client";
import { BoothForm } from "../booth-form";
import type { PaymentConfig } from "@/lib/types";

/**
 * Degrade-path fallback for `initialPayment` below, used when paykit's
 * `getVendorConfig` call fails (e.g. `PAYKIT_KIT_SECRET` unset in this
 * environment) — `booths.payment` only ever stores a minimal `{kind}`
 * marker (see saveBooth/paymentMarker in ../actions.ts), so this can only
 * re-select the right radio option; every text field starts blank.
 */
function initialPaymentFromMarker(data: unknown): PaymentConfig | null {
  const kind = (data as { kind?: string } | null)?.kind;
  if (kind === "paynow") return { kind: "paynow", payee_name: "" };
  if (kind === "pointer") return { kind: "pointer", label: "" };
  return null;
}

/**
 * Prefer paykit's own vendor config (the real editable fields) so re-opening
 * an existing booth's Payment settings starts pre-filled; fall back to the
 * `{kind}`-only marker when paykit's call degrades or reports no config.
 */
async function initialPayment(
  vendorId: string,
  boothPayment: unknown,
): Promise<PaymentConfig | null> {
  const result = await getVendorConfig(vendorId);
  if (!result.ok || !result.data.hasConfig)
    return initialPaymentFromMarker(boothPayment);

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
  return initialPaymentFromMarker(boothPayment);
}

/**
 * Read-only booking-status prefill for `BookingStatusSection`. `null` when
 * no `paykit_booking_id` is set (nothing to fetch — the section then shows
 * only the input field) or when paykit's read fails/degrades (unreachable,
 * `PAYKIT_KIT_SECRET` unset) — a degrade here never blocks the rest of the
 * page from rendering.
 */
async function initialBookingStatus(
  paykitBookingId: string | null,
): Promise<BookingStatus | null> {
  if (!paykitBookingId) return null;
  const result = await getBookingStatus(paykitBookingId);
  return result.ok ? result.data : null;
}

export const revalidate = 0;

interface Props {
  params: Promise<{ boothId: string }>;
}

export default async function EditBoothPage({ params }: Props) {
  const { boothId } = await params;
  const { vendor, entitlement } = await requireEntitledVendor();

  const supabase = await createServerClient();
  // RLS scopes this to the vendor's own booths; a foreign id returns null.
  const { data: booth } = await supabase
    .from("booths")
    .select(
      "id, name, image_url, is_active, hours, menu_items, payment, social_links, requires_arrival_confirm, walkup_default, print_enabled, paykit_booking_id",
    )
    .eq("id", boothId)
    .maybeSingle();

  if (!booth) notFound();

  const menuItemCount = parseMenuItems(booth.menu_items).length;

  const payment = await initialPayment(vendor.id, booth.payment);
  const bookingStatus = await initialBookingStatus(booth.paykit_booking_id);

  return (
    <div className="mx-auto max-w-lg md:max-w-4xl">
      <h1 className="font-display mb-6 text-3xl font-semibold">Edit booth</h1>
      <BoothForm
        vendorId={vendor.id}
        entitlement={entitlement}
        vendorSocialLinks={vendor.social_links}
        initial={{
          boothId: booth.id,
          name: booth.name,
          image_url: booth.image_url,
          is_active: booth.is_active,
          hours: parseBoothHours(booth.hours),
          menuItemCount,
          payment,
          social_links: booth.social_links
            ? parseSocialLinks(booth.social_links)
            : null,
          requires_arrival_confirm: booth.requires_arrival_confirm,
          walkup_default: booth.walkup_default,
          print_enabled: booth.print_enabled,
          paykit_booking_id: booth.paykit_booking_id,
          bookingStatus,
        }}
      />
    </div>
  );
}
