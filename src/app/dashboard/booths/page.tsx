import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVendor } from "@/lib/supabase/get-vendor";
import { createServerClient } from "@/lib/supabase/server";
import { parseMenuItems } from "@/lib/schemas";
import { BoothList } from "./booth-list";

export const revalidate = 0;

export default async function BoothsPage() {
  const { user, vendor } = await getVendor();
  if (!user) redirect("/login");
  if (!vendor) redirect("/onboarding");

  const supabase = await createServerClient();
  const { data: booths } = await supabase
    .from("booths")
    .select("id, name, is_active, image_url, menu_items")
    .eq("vendor_id", vendor.id)
    .order("created_at", { ascending: true });

  const rows = (booths ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    is_active: b.is_active,
    image_url: b.image_url,
    itemCount: parseMenuItems(b.menu_items).length,
  }));

  return (
    <div>
      <div className="mb-7 flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Your stalls
          </p>
          <h1 className="font-display text-4xl font-semibold leading-none">
            Booths
          </h1>
        </div>
        <Button asChild className="rounded-lg">
          <Link href="/dashboard/booths/new">
            <Plus className="size-4" /> New booth
          </Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="ticket mt-10 overflow-hidden rounded-2xl border border-dashed border-border py-16 text-center">
          <p className="font-display text-2xl font-semibold">No booths yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first booth to start taking orders.
          </p>
        </div>
      ) : (
        <BoothList booths={rows} />
      )}
    </div>
  );
}
