import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { parseMenuCategories, parseMenuItems } from "@/lib/schemas";
import { MenuManager } from "../../menu-manager";

export const revalidate = 0;

interface Props {
  params: Promise<{ boothId: string }>;
}

export default async function BoothMenuPage({ params }: Props) {
  const { boothId } = await params;
  const { vendor, entitlement } = await requireEntitledVendor();

  const supabase = await createServerClient();
  // RLS scopes this to the vendor's own booths; a foreign id returns null.
  const { data: booth } = await supabase
    .from("booths")
    .select("id, name, menu_items, menu_categories")
    .eq("id", boothId)
    .maybeSingle();

  if (!booth) notFound();

  const items = parseMenuItems(booth.menu_items).map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    price_cents: m.price_cents,
    cost_cents: m.cost_cents,
    image_url: m.image_url ?? null,
    option_groups: m.option_groups,
    available: m.available,
    stock: m.stock,
    category: m.category,
  }));
  const categories = parseMenuCategories(booth.menu_categories);

  return (
    <MenuManager
      vendorId={vendor.id}
      boothId={booth.id}
      boothName={booth.name}
      entitlement={entitlement}
      initialItems={items}
      initialCategories={categories}
    />
  );
}
