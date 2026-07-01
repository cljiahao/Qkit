import { notFound } from "next/navigation";
import { MediaImage } from "@/components/media-image";
import { createServerClient } from "@/lib/supabase/server";
import { parseMenuItems, parseBoothHours } from "@/lib/schemas";
import { isBoothOpen, nextOpenLabel } from "@/lib/hours";
import { parseRemaining } from "@/lib/stock";
import { isTokenValid } from "@/lib/booth-token";
import { OrderForm } from "./order-form";
import { RecentOrders } from "./recent-orders";
import { ExpiredCode } from "./expired-code";

export const revalidate = 0;

interface Props {
  params: Promise<{ boothId: string }>;
  searchParams: Promise<{ k?: string }>;
}

export default async function OrderPage({ params, searchParams }: Props) {
  const { boothId } = await params;
  const { k } = await searchParams;
  const supabase = await createServerClient();

  // Booth row and live stock both key only on boothId and are independent, so
  // fetch them together — one round-trip on the customer hot path (QR scan).
  const [{ data: booth }, { data: remainingData }, { data: servableData }] =
    await Promise.all([
      supabase
        .from("booths")
        .select("id, name, image_url, hours, menu_items, access_token")
        .eq("id", boothId)
        .eq("is_active", true)
        .single(),
      supabase.rpc("booth_remaining_stock", { p_booth_id: boothId }),
      supabase.rpc("booth_servable", { p_booth_id: boothId }),
    ]);

  if (!booth) notFound();

  // Hard-block a stale/absent QR token. Checked after the booth exists so we
  // never confirm-or-deny a booth's existence via the token path any differently
  // than the normal not-found path. Status page is intentionally NOT gated.
  if (!isTokenValid(booth.access_token, k)) return <ExpiredCode />;

  // Authoritative serveability (SECURITY DEFINER): a free vendor's over-limit
  // "paused" booth isn't orderable even though the signed-in owner's own-row RLS
  // exposes it. `=== false` only (null/pre-migration → allow).
  const servable = servableData !== false;

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
  // A paused (unservable) booth can't take orders even if its hours say "open".
  const closed = !open || !servable;

  // Live remaining stock per capped item (counts only, no order PII). Absent
  // until migration 0010 lands → treated as all-unlimited.
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
        <p className="mt-2 text-sm text-muted-foreground">
          Order right here — no app, no account. Just add your name.
        </p>
      </header>

      <RecentOrders boothId={booth.id} />

      {closed && (
        <div className="mb-7 rounded-xl border border-status-cancelled/30 bg-status-cancelled/10 px-4 py-3 text-center">
          <p className="font-display text-lg font-semibold text-status-cancelled">
            {!servable ? "Not taking orders" : "Closed right now"}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {!servable
              ? "This booth isn't accepting orders right now."
              : `${reopen ?? "Not taking orders at the moment."} You can browse the menu below.`}
          </p>
        </div>
      )}

      <OrderForm
        boothId={booth.id}
        token={booth.access_token}
        menuItems={available}
        closed={closed}
        remaining={remaining}
      />
    </div>
  );
}
