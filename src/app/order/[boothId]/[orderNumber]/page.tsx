import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import dynamic from "next/dynamic";
import QRCode from "react-qr-code";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getOrCreateVendorProfile,
  type VendorProfile,
} from "@/lib/merqo-vendor-profile";
import { Ticket } from "@/components/ticket";
import { formatOptions, formatPrice, orderHasPricing } from "@/lib/utils";
import {
  boardSettingsSchema,
  orderBoothIdSchema,
  orderNumberSchema,
  orderTokenSchema,
  parseOrderItems,
  parseSocialLinks,
  resolveSocialLinks,
} from "@/lib/schemas";
import { displayOrderNumber, isTerminal } from "@/lib/orders";
import { sgtStartOfDayIso } from "@/lib/tz";
import { FeedbackForm } from "@/components/feedback-form";
import { ReorderButton } from "@/components/reorder-button";
import { OrderStatusPoller } from "./order-status-poller";
import { EarnLink } from "./earn-link";
import { TelegramConnect } from "./telegram-connect";
import { SocialLinksRow } from "@/components/social-links-row";

// showPay is false for most orders (queue-only booths, or once payment is a
// moot point), so PayPanel shouldn't ship in every order-status page's JS.
const PayPanel = dynamic(() => import("./pay-panel").then((m) => m.PayPanel));

interface Props {
  params: Promise<{ boothId: string; orderNumber: string }>;
  searchParams: Promise<{ t?: string }>;
}

export const revalidate = 0;

/**
 * Vendor-level default social links, so a booth without its own override
 * still shows the vendor's. Unlike get-entitlement's fail-loud convention, a
 * failure here must NOT take down the page: this is a customer holding a
 * valid, paid order link, and the vendor-level links are a decorative
 * footer, not load-bearing — degrade to null (booth-only links, or none) on
 * any RPC error rather than throw.
 */
async function loadVendorProfile(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  vendorId: string,
): Promise<VendorProfile | null> {
  try {
    return await getOrCreateVendorProfile(supabase, vendorId, null);
  } catch (err) {
    console.error(
      "order-status: vendor profile read failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * board_settings-derived page state: the daily-reset heading number (see
 * displayOrderNumber in @/lib/orders) and whether the vendor has turned on
 * the pickup QR (pickup_scan_enabled) — one vendor-row read serves both, so
 * the pickup toggle doesn't cost a second query. Decorative, so any failure
 * here degrades to the real order_number / QR-off rather than breaking the
 * page — same philosophy as loadVendorProfile above.
 */
async function resolveOrderDisplay(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  boothId: string,
  vendorId: string,
  orderNumber: string,
): Promise<{ headingNumber: string; pickupScanEnabled: boolean }> {
  try {
    const { data: vendorRow } = await supabase
      .from("vendors")
      .select("board_settings")
      .eq("id", vendorId)
      .maybeSingle();
    const settings = boardSettingsSchema.safeParse(vendorRow?.board_settings);
    const pickupScanEnabled =
      settings.success && settings.data.pickup_scan_enabled;

    if (!settings.success || !settings.data.daily_order_number_reset)
      return { headingNumber: orderNumber, pickupScanEnabled };

    const { data: firstToday } = await supabase
      .from("orders")
      .select("order_number")
      .eq("booth_id", boothId)
      .gte("created_at", sgtStartOfDayIso())
      .order("order_number", { ascending: true })
      .limit(1)
      .maybeSingle();
    return {
      headingNumber: firstToday
        ? displayOrderNumber(orderNumber, firstToday.order_number)
        : orderNumber,
      pickupScanEnabled,
    };
  } catch (err) {
    console.error(
      "order-status: daily display-number read failed",
      err instanceof Error ? err.message : err,
    );
    return { headingNumber: orderNumber, pickupScanEnabled: false };
  }
}

// host/x-forwarded-host are client-spoofable (same caution clientIp's own
// doc comment gives in @/lib/rate-limit, "NOT trusted... a coarse fairness
// key, not an authz signal") — this allowlist is a basic check, not full
// trusted-proxy IP-range validation (that's a separate, bigger task).
const ALLOWED_HOST_SUFFIXES = [".merqo.io", ".vercel.app"];

function isAllowedHost(host: string): boolean {
  const hostname = host.split(":")[0];
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

// Host-header-derived origin, not an env var — booth-qr-poster.tsx's design
// doc found NEXT_PUBLIC_BASE_URL unreliable, and this URL must resolve on a
// separate scanning device, not just this render. Prefers the plain `host`
// header; `x-forwarded-host` is only used as a fallback, and only once it
// also passes the allowlist above.
async function resolveOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  const forwardedHost = h.get("x-forwarded-host");

  let trustedHost: string | null = null;
  if (host && isAllowedHost(host)) trustedHost = host;
  else if (forwardedHost && isAllowedHost(forwardedHost))
    trustedHost = forwardedHost;

  if (!trustedHost) return "https://qkit.example";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${trustedHost}`;
}

export default async function OrderStatusPage({ params, searchParams }: Props) {
  const { boothId, orderNumber } = await params;
  const { t: token } = await searchParams;

  // Validate the route params AND the per-order token before the query. booth_id
  // is not secret (it's in the URL a customer gets), and order numbers are short
  // sequential per-booth strings — the unguessable `token` is what authorizes the
  // read, so without a valid one there's nothing to show (closes the enumeration
  // of other customers' orders at the same booth).
  if (
    !orderBoothIdSchema.safeParse(boothId).success ||
    !orderNumberSchema.safeParse(orderNumber).success ||
    !token ||
    !orderTokenSchema.safeParse(token).success
  )
    notFound();

  // Service client bypasses RLS — customers are unauthenticated
  const supabase = await createServiceClient();

  // Both reads key only on the route params, so fetch them together instead of
  // serially (one round-trip of latency, not two) on this hot status page. The
  // order read also matches the token, so a wrong/guessed number returns nothing.
  const [{ data: order, error: orderError }, { data: booth }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("*")
        .eq("booth_id", boothId)
        .eq("order_number", orderNumber)
        .eq("access_token", token)
        .maybeSingle(),
      supabase
        .from("booths")
        .select("name, vendor_id, social_links, requires_arrival_confirm")
        .eq("id", boothId)
        .single(),
    ]);

  // A real read error must not masquerade as "order doesn't exist" — that's a
  // false 404 stranding a customer who holds a valid link during a DB/network
  // blip. Let the error boundary show a retryable error; only a genuine no-row
  // (maybeSingle → null, no error) is a true 404.
  if (orderError)
    throw new Error(`order status read failed: ${orderError.message}`);
  if (!order || order.order_number == null) notFound();

  // A still-unclaimed payment belongs on /pay, not here (stale bookmark guard).
  if (order.payment_status === "pending") {
    redirect(`/order/${boothId}/pay?t=${token}`);
  }

  // Vendor-level default links, so a booth without its own override still
  // shows the vendor's. Small extra query (not embeddable via Promise.all
  // above — it depends on booth.vendor_id) but this page isn't a hot path.
  const vendorProfile = booth?.vendor_id
    ? await loadVendorProfile(supabase, booth.vendor_id)
    : null;
  const socialLinks = resolveSocialLinks(
    booth?.social_links ? parseSocialLinks(booth.social_links) : null,
    parseSocialLinks(vendorProfile?.social_links ?? null),
  );

  const { headingNumber, pickupScanEnabled } = booth?.vendor_id
    ? await resolveOrderDisplay(
        supabase,
        boothId,
        booth.vendor_id,
        order.order_number,
      )
    : { headingNumber: order.order_number, pickupScanEnabled: false };

  const pickupUrl =
    order.status === "ready" && pickupScanEnabled
      ? `${await resolveOrigin()}/order/${boothId}/${orderNumber}?t=${token}`
      : null;

  const items = parseOrderItems(order.items);
  const priced = orderHasPricing(items);

  // Show the pay panel for any payment-expected, non-cancelled order (NOT
  // isTerminal: a completed order still shows PayPanel's "confirmed" state).
  const showPay =
    order.payment_status !== "not_required" && order.status !== "cancelled";

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col px-5 py-10">
      <Ticket shadow="lifted">
        <header className="px-6 pt-9 pb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {booth?.name}
          </p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Order
          </p>
          <h1 className="font-mono text-6xl font-bold leading-none tracking-tight">
            #{headingNumber}
          </h1>
          <p className="mt-3 text-muted-foreground">
            for {order.customer_name}
          </p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            Remember this number for pickup
          </p>
        </header>

        <div className="perforation" />

        {/* Pay comes first, above status/progress — it's the customer's
            actual call-to-action while an order is unpaid, not passive
            information like "you're next in line". */}
        {showPay && (
          <>
            <PayPanel
              boothId={boothId}
              orderNumber={orderNumber}
              token={token}
              initialStatus={order.payment_status}
            />
            <div className="perforation" />
          </>
        )}

        <OrderStatusPoller
          boothId={boothId}
          orderNumber={orderNumber}
          displayNumber={headingNumber}
          token={token}
          initialStatus={order.status}
          boothName={booth?.name ?? "Your order"}
          placedAt={order.created_at}
          // The kitchen status (pending→…→completed) and payment status
          // (pending→claimed→confirmed) advance independently — a vendor can
          // mark an order preparing/ready before the customer has paid. Don't
          // let the status text claim progress that implies payment is
          // settled when it isn't.
          awaitingPayment={showPay && order.payment_status !== "confirmed"}
          requiresArrivalConfirm={booth?.requires_arrival_confirm ?? false}
        />

        {/* The connect button only makes sense while the order is still
            waiting — once it's ready/completed/cancelled, there's nothing
            left to notify about, or the moment already passed. */}
        {!isTerminal(order.status) &&
          order.status !== "ready" &&
          booth?.vendor_id && (
            <TelegramConnect orderId={order.id} vendorId={booth.vendor_id} />
          )}

        {/* Pulled up next to the status/ETA block rather than buried in the
            footer below items — a customer stares at this page for several
            idle minutes while waiting, and something to do (follow the
            booth) belongs near the thing they're already looking at, not
            past the transactional content. */}
        {Object.keys(socialLinks).length > 0 && (
          <div className="flex flex-col items-center gap-2 px-6 pb-6">
            <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
              Follow {booth?.name}
            </p>
            <SocialLinksRow links={socialLinks} />
          </div>
        )}

        <div className="perforation" />

        <section className="space-y-1.5 px-6 py-5">
          {items.map((item, i) => (
            <div key={i} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate">
                  <span className="font-mono text-muted-foreground">
                    {item.quantity}×
                  </span>{" "}
                  {item.name}
                </span>
                {priced && (
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {item.price_cents == null
                      ? "Free"
                      : formatPrice(item.price_cents * item.quantity)}
                  </span>
                )}
              </div>
              {formatOptions(item.options) && (
                <p className="pl-5 text-xs text-muted-foreground">
                  {formatOptions(item.options)}
                </p>
              )}
            </div>
          ))}
          {priced && (
            <div className="mt-1 flex justify-between border-t border-border/60 pt-3 font-semibold">
              <span>Total</span>
              <span className="font-mono">
                {formatPrice(order.total_cents)}
              </span>
            </div>
          )}
        </section>

        {pickupUrl && (
          <>
            <div className="perforation" />
            <section className="flex flex-col items-center gap-3 px-6 py-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Show this at the pickup counter to collect
              </p>
              <div className="rounded-xl bg-white p-4">
                <QRCode value={pickupUrl} size={180} />
              </div>
            </section>
          </>
        )}
      </Ticket>

      {/* Only once the order is done, not while still in progress — a
          request made mid-task is both more annoying and yields lower-
          quality responses than the same ask made after completion. */}
      {order.status === "completed" && (
        <div className="mt-6">
          <FeedbackForm
            source="customer"
            boothId={boothId}
            orderNumber={orderNumber}
            token={token}
            prompt="How was ordering here?"
          />
        </div>
      )}

      <div className="mt-auto flex flex-col items-center gap-3 pt-8">
        {order.status === "completed" && booth?.vendor_id && (
          <EarnLink orderId={order.id} vendorId={booth.vendor_id} />
        )}
        {items.length > 0 && (
          <ReorderButton
            boothId={boothId}
            // Client-safe lines only — cost_cents never leaves the server.
            lines={items.map((it) => ({
              menuItemId: it.menuItemId,
              quantity: it.quantity,
              options: it.options,
            }))}
            customerName={order.customer_name}
            label="Reorder these items"
            className="h-11 rounded-xl px-5"
          />
        )}
        <Link
          href={`/order/${boothId}`}
          className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          {items.length > 0 ? "Order something else" : "Order again"}
        </Link>
      </div>
    </div>
  );
}
