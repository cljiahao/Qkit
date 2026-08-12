import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import {
  parseMenuItems,
  parseBoothHours,
  parseSocialLinks,
} from "@/lib/schemas";
import { getVendorConfig } from "@/lib/paykit/client";
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
      "id, name, image_url, is_active, hours, menu_items, payment, social_links, requires_arrival_confirm",
    )
    .eq("id", boothId)
    .maybeSingle();

  if (!booth) notFound();

  const menuItems = parseMenuItems(booth.menu_items).map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    price_cents: m.price_cents,
    cost_cents: m.cost_cents,
    image_url: m.image_url ?? null,
    option_groups: m.option_groups,
    available: m.available,
    stock: m.stock,
  }));

  const payment = await initialPayment(vendor.id, booth.payment);

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
          menu_items: menuItems,
          payment,
          social_links: booth.social_links
            ? parseSocialLinks(booth.social_links)
            : null,
          requires_arrival_confirm: booth.requires_arrival_confirm,
        }}
      />
    </div>
  );
}
