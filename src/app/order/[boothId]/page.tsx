import { notFound } from "next/navigation";
import { MediaImage } from "@/components/media-image";
import { createServerClient } from "@/lib/supabase/server";
import { parseMenuItems, parseBoothHours } from "@/lib/schemas";
import { isBoothOpen, nextOpenLabel } from "@/lib/hours";
import { parseRemaining } from "@/lib/stock";
import { OrderForm } from "./order-form";
import { RecentOrders } from "./recent-orders";

export const revalidate = 0;

interface Props {
  params: Promise<{ boothId: string }>;
}

export default async function OrderPage({ params }: Props) {
  const { boothId } = await params;
  const supabase = await createServerClient();

  const { data: booth } = await supabase
    .from("booths")
    .select("id, name, image_url, hours, menu_items")
    .eq("id", boothId)
    .eq("is_active", true)
    .single();

  if (!booth) notFound();

  // Strip cost_cents before anything reaches the customer's browser — vendor
  // cost is private and only ever used server-side for margin stats.
  const available = parseMenuItems(booth.menu_items)
    .filter((m) => m.available)
    .map(({ cost_cents: _cost, ...m }) => m);

  // Server-time open/closed check (SGT). is_active is already true here.
  const nowIso = new Date().toISOString();
  const hours = parseBoothHours(booth.hours);
  const open = isBoothOpen({ is_active: true, hours }, nowIso);
  const reopen = open
    ? null
    : nextOpenLabel({ is_active: true, hours }, nowIso);

  // Live remaining stock per capped item (counts only, no order PII). Absent
  // until migration 0010 lands → treated as all-unlimited.
  const { data: remainingData } = await supabase.rpc("booth_remaining_stock", {
    p_booth_id: booth.id,
  });
  const remaining = parseRemaining(remainingData);

  return (
    <div className="mx-auto min-h-screen max-w-lg px-5 pb-28 pt-8">
      {booth.image_url && (
        <div className="relative mb-5 h-40 w-full overflow-hidden rounded-2xl border border-border">
          <MediaImage
            src={booth.image_url}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 32rem"
            className="object-cover"
          />
        </div>
      )}
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Order from
        </p>
        <h1 className="font-display mt-1 text-4xl font-semibold leading-[1.05]">
          {booth.name}
        </h1>
      </header>

      <RecentOrders boothId={booth.id} />

      {!open && (
        <div className="mb-7 rounded-xl border border-status-cancelled/30 bg-status-cancelled/10 px-4 py-3 text-center">
          <p className="font-display text-lg font-semibold text-status-cancelled">
            Closed right now
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {reopen ?? "Not taking orders at the moment."} You can browse the
            menu below.
          </p>
        </div>
      )}

      <OrderForm
        boothId={booth.id}
        menuItems={available}
        closed={!open}
        remaining={remaining}
      />
    </div>
  );
}
