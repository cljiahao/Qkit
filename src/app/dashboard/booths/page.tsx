import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createServerClient } from "@/lib/supabase/server";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { parseMenuItems } from "@/lib/schemas";
import { canAddBooth } from "@/lib/plan";
import { servableBoothIds, isBoothPaused } from "@/lib/booth-access";
import { ProLock } from "@/components/pro-lock";
import { BoothList } from "./booth-list";

export const revalidate = 0;

export default async function BoothsPage() {
  const { vendor, entitlement } = await requireEntitledVendor();

  const supabase = await createServerClient();
  const { data: booths } = await supabase
    .from("booths")
    .select(
      "id, name, is_active, image_url, menu_items, created_at, short_code",
    )
    .eq("vendor_id", vendor.id)
    .order("created_at", { ascending: true });

  const all = booths ?? [];
  const servable = servableBoothIds(all, entitlement);
  const rows = all.map((b) => ({
    id: b.id,
    name: b.name,
    is_active: b.is_active,
    image_url: b.image_url,
    itemCount: parseMenuItems(b.menu_items).length,
    paused: isBoothPaused(b, servable),
    shortCode: b.short_code,
  }));

  const canCreate = canAddBooth(entitlement, rows.length);
  const pausedCount = rows.filter((r) => r.paused).length;

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
        {canCreate ? (
          <Button asChild className="rounded-lg">
            <Link href="/dashboard/booths/new">
              <Plus className="size-4" /> New booth
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline" className="rounded-lg">
            <Link href="/dashboard/plan">
              <Sparkles className="size-4" /> Upgrade to add booths
            </Link>
          </Button>
        )}
      </div>

      {pausedCount > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Your plan serves <strong>1 live booth</strong> at a time —{" "}
            {pausedCount} booth{pausedCount === 1 ? " is" : "s are"} paused for
            customers. Keep all your booths live at once with Pro or an event
            pass.
          </span>
          <ProLock feature="multi_booth_active" label="Keep all live" />
        </div>
      )}

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
