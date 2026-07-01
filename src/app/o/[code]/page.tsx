import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { parseMenuItems, parseBoothHours } from "@/lib/schemas";
import { isBoothOpen, nextOpenLabel } from "@/lib/hours";
import { parseRemaining } from "@/lib/stock";
import { OrderForm } from "@/components/order/order-form";
import { RecentOrders } from "@/components/order/recent-orders";
import { ExpiredCode } from "@/components/order/expired-code";
import { MediaImage } from "@/components/media-image";

export const revalidate = 0;

interface Props {
  params: Promise<{ code: string }>;
}

// Shape returned by get_booth_for_order (public-safe; no cost_cents/short_code).
const boothForOrder = z.object({
  booth_id: z.string(),
  name: z.string(),
  image_url: z.string().nullable(),
  hours: z.unknown().nullable(),
  is_active: z.boolean(),
  servable: z.boolean(),
  menu_items: z.unknown(),
  remaining: z.unknown(),
});

export default async function OrderEntryPage({ params }: Props) {
  const { code } = await params;
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("get_booth_for_order", {
    p_short_code: code,
  });
  const parsed = boothForOrder.safeParse(data);
  if (!parsed.success) return <ExpiredCode />; // null/unresolved code → hard block
  const booth = parsed.data;

  const available = parseMenuItems(booth.menu_items);
  const nowIso = new Date().toISOString();
  const hours = parseBoothHours(booth.hours);
  const open = isBoothOpen({ is_active: booth.is_active, hours }, nowIso);
  const reopen = open
    ? null
    : nextOpenLabel({ is_active: booth.is_active, hours }, nowIso);
  const closed = !open || !booth.servable;
  const remaining = parseRemaining(booth.remaining);

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
        <p className="mt-2 text-sm text-muted-foreground">
          Order right here — no app, no account. Just add your name.
        </p>
      </header>
      <RecentOrders boothId={booth.booth_id} />
      {closed && (
        <div className="mb-7 rounded-xl border border-status-cancelled/30 bg-status-cancelled/10 px-4 py-3 text-center">
          <p className="font-display text-lg font-semibold text-status-cancelled">
            {!booth.servable ? "Not taking orders" : "Closed right now"}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {!booth.servable
              ? "This booth isn't accepting orders right now."
              : `${reopen ?? "Not taking orders at the moment."} You can browse the menu below.`}
          </p>
        </div>
      )}
      <OrderForm
        code={code}
        boothId={booth.booth_id}
        menuItems={available}
        closed={closed}
        remaining={remaining}
      />
    </div>
  );
}
