import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import {
  parseMenuItems,
  parseMenuCategories,
  parseBoothHours,
  parseSocialLinks,
} from "@/lib/schemas";
import { isBoothOpen, nextOpenLabel } from "@/lib/hours";
import { parseRemaining } from "@/lib/stock";
import { OrderForm } from "@/components/order/order-form";
import { RecentOrders } from "@/components/order/recent-orders";
import { ExpiredCode } from "@/components/order/expired-code";
import { MediaImage } from "@/components/media-image";
import { SocialLinksRow } from "@/components/social-links-row";

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
  menu_categories: z.unknown(),
  remaining: z.unknown(),
  social_links: z.unknown(),
});

/**
 * Cups the booth can still serve today, or null when it has no cap
 * (booths.daily_cup_cap, migration 0094). Read separately from
 * get_booth_for_order so that RPC's public-safe shape stays as it is, and
 * degraded to null on any failure: the orders_daily_cup_cap trigger is the
 * real limit, so a failure here costs a warning, never correctness.
 */
async function loadCupsLeft(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  boothId: string,
): Promise<number | null> {
  const { data, error } = await supabase.rpc("booth_cups_left", {
    p_booth_id: boothId,
  });
  if (error) {
    console.error("booth_cups_left failed", error.message);
    return null;
  }
  return typeof data === "number" ? data : null;
}

// Below this many cups left, the page says how many are left. Above it the
// number is noise: nobody queues differently at 40 cups remaining.
const LOW_STOCK_CUPS = 10;

export default async function OrderEntryPage({ params }: Props) {
  const { code } = await params;
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("get_booth_for_order", {
    p_short_code: code,
  });
  // A DB/RPC error is NOT the same as an unresolved code: the code may be valid
  // and telling the customer to rescan sends them in a loop. Log it and show the
  // transient-error screen instead of "QR expired".
  if (error) {
    console.error("get_booth_for_order failed", error.message);
    return <ExpiredCode variant="error" />;
  }
  const parsed = boothForOrder.safeParse(data);
  // null/unresolved code → hard block
  if (!parsed.success) return <ExpiredCode />;
  const booth = parsed.data;

  const available = parseMenuItems(booth.menu_items);
  const categories = parseMenuCategories(booth.menu_categories);
  const nowIso = new Date().toISOString();
  const hours = parseBoothHours(booth.hours);
  const open = isBoothOpen({ is_active: booth.is_active, hours }, nowIso);
  const reopen = open
    ? null
    : nextOpenLabel({ is_active: booth.is_active, hours }, nowIso);
  const cupsLeft = await loadCupsLeft(supabase, booth.booth_id);
  const soldOutToday = cupsLeft === 0;
  const closed = !open || !booth.servable || soldOutToday;
  const remaining = parseRemaining(booth.remaining);
  // Three closed reasons, most specific first: the day's cups are gone, the
  // booth is paused, or it is simply outside opening hours.
  let closedTitle = "Closed right now";
  let closedDetail = `${reopen ?? "Not taking orders at the moment."} You can browse the menu below.`;
  if (soldOutToday) {
    closedTitle = "Sold out for today";
    closedDetail =
      "They have served everything they had for today. You can still browse the menu below.";
  } else if (!booth.servable) {
    closedTitle = "Not taking orders";
    closedDetail = "This booth isn't accepting orders right now.";
  }
  const socialLinks = parseSocialLinks(booth.social_links);

  return (
    <div className="mx-auto min-h-screen max-w-lg px-5 pb-28 pt-8 md:max-w-2xl">
      <div className="md:mx-auto md:max-w-lg">
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
          <h1 className="font-display mt-1 text-4xl font-semibold leading-[1.05] break-words">
            {booth.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Order right here, no app, no account. Just add your name.
          </p>
        </header>
        <RecentOrders boothId={booth.booth_id} />
        {closed && (
          <div className="mb-7 rounded-xl border border-status-cancelled/30 bg-status-cancelled/10 px-4 py-3 text-center">
            <p className="font-display text-lg font-semibold text-status-cancelled">
              {closedTitle}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {closedDetail}
            </p>
            {Object.keys(socialLinks).length > 0 && (
              <div className="mt-3 flex flex-col items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Reach {booth.name} here
                </p>
                <SocialLinksRow links={socialLinks} />
              </div>
            )}
          </div>
        )}
      </div>
      {cupsLeft != null && cupsLeft > 0 && cupsLeft <= LOW_STOCK_CUPS && (
        <div className="mb-7 rounded-xl border border-status-aging/40 bg-status-aging/10 px-4 py-3 text-center md:mx-auto md:max-w-lg">
          <p className="text-sm font-semibold">
            Only {cupsLeft} {cupsLeft === 1 ? "cup" : "cups"} left today
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Once they are gone this stall stops taking orders until tomorrow.
          </p>
        </div>
      )}
      <OrderForm
        code={code}
        boothId={booth.booth_id}
        menuItems={available}
        menuCategories={categories}
        closed={closed}
        remaining={remaining}
      />
    </div>
  );
}
