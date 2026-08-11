import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import {
  parseMenuItems,
  parseBoothHours,
  parseSocialLinks,
} from "@/lib/schemas";
import { BoothForm } from "../booth-form";
import type { PaymentConfig } from "@/lib/types";

/**
 * booths.payment now stores only a minimal `{kind}` marker (see
 * saveBooth/paymentMarker in ../actions.ts) — the full config lives in
 * paykit, which has no route for a calling kit to read it back (its
 * `/api/v1/vendors/{id}/config` GET returns only `has_config`/`display_name`,
 * not the editable fields). So editing an existing config re-selects the
 * right radio option but starts every text field blank — a known, flagged
 * limitation of the cutover, not a bug: the vendor re-enters full details
 * each time they revisit Payment settings.
 */
function initialPaymentFromMarker(data: unknown): PaymentConfig | null {
  const kind = (data as { kind?: string } | null)?.kind;
  if (kind === "paynow") return { kind: "paynow", payee_name: "" };
  if (kind === "pointer") return { kind: "pointer", label: "" };
  return null;
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
          payment: initialPaymentFromMarker(booth.payment),
          social_links: booth.social_links
            ? parseSocialLinks(booth.social_links)
            : null,
          requires_arrival_confirm: booth.requires_arrival_confirm,
        }}
      />
    </div>
  );
}
