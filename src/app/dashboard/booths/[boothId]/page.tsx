import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import {
  parseMenuItems,
  parseBoothHours,
  parsePaymentConfig,
} from "@/lib/schemas";
import { BoothForm } from "../booth-form";

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
    .select("id, name, image_url, is_active, hours, menu_items, payment")
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
    <div>
      <h1 className="font-display mb-6 text-3xl font-semibold">Edit booth</h1>
      <BoothForm
        vendorId={vendor.id}
        entitlement={entitlement}
        initial={{
          boothId: booth.id,
          name: booth.name,
          image_url: booth.image_url,
          is_active: booth.is_active,
          hours: parseBoothHours(booth.hours),
          menu_items: menuItems,
          payment: parsePaymentConfig(booth.payment),
        }}
      />
    </div>
  );
}
