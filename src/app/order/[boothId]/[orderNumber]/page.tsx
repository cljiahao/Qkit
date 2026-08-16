import { notFound } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
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
import { createCheckout, type CheckoutView } from "@/lib/paykit/client";
import { FeedbackForm } from "@/components/feedback-form";
import { ReorderButton } from "@/components/reorder-button";
import { OrderStatusPoller } from "./order-status-poller";
import { EarnLink } from "./earn-link";
import { TelegramConnect } from "./telegram-connect";
import { SocialLinksRow } from "@/components/social-links-row";

// Split out react-qr-code's bundle: showPay is false for most orders
// (queue-only booths, or once payment is a moot point), so PayPanel
// shouldn't ship in every order-status page's JS regardless.
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
 * Daily order-number reset (board_settings.daily_order_number_reset): shows
 * this order's position among today's orders instead of its permanent
 * order_number — same display-only rule the vendor board applies (see
 * displayOrderNumber in @/lib/orders). Decorative, so any failure here
 * degrades to the real order_number rather than breaking the page — same
 * philosophy as loadVendorProfile above.
 */
async function resolveHeadingNumber(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  boothId: string,
  vendorId: string,
  orderNumber: string,
): Promise<string> {
  try {
    const { data: vendorRow } = await supabase
      .from("vendors")
      .select("board_settings")
      .eq("id", vendorId)
      .maybeSingle();
    const settings = boardSettingsSchema.safeParse(vendorRow?.board_settings);
    if (!settings.success || !settings.data.daily_order_number_reset)
      return orderNumber;

    const { data: firstToday } = await supabase
      .from("orders")
      .select("order_number")
      .eq("booth_id", boothId)
      .gte("created_at", sgtStartOfDayIso())
      .order("order_number", { ascending: true })
      .limit(1)
      .maybeSingle();
    return firstToday
      ? displayOrderNumber(orderNumber, firstToday.order_number)
      : orderNumber;
  } catch (err) {
    console.error(
      "order-status: daily display-number read failed",
      err instanceof Error ? err.message : err,
    );
    return orderNumber;
  }
}

/**
 * Fetch the paykit checkout view for a payment-expected order. A 422 (no/
 * incomplete paykit config) or any other failure (paykit down, network)
 * degrades to null (no pay panel content, not a page error) — a customer
 * holding a valid, paid order link must not get a hard error just because
 * paykit is unreachable, same philosophy as the two reads above.
 */
async function loadCheckoutView(
  vendorId: string,
  amountCents: number,
  orderId: string,
): Promise<CheckoutView | null> {
  const result = await createCheckout({
    vendorId,
    amountCents,
    orderRef: orderId,
  });
  if (result.ok) return result.data;
  console.error(
    "order-status: paykit checkout failed",
    result.status,
    result.error,
  );
  return null;
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
        .select("name, vendor_id, social_links")
        .eq("id", boothId)
        .single(),
    ]);

  // A real read error must not masquerade as "order doesn't exist" — that's a
  // false 404 stranding a customer who holds a valid link during a DB/network
  // blip. Let the error boundary show a retryable error; only a genuine no-row
  // (maybeSingle → null, no error) is a true 404.
  if (orderError)
    throw new Error(`order status read failed: ${orderError.message}`);
  if (!order) notFound();

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

  const headingNumber = booth?.vendor_id
    ? await resolveHeadingNumber(
        supabase,
        boothId,
        booth.vendor_id,
        order.order_number,
      )
    : order.order_number;

  const items = parseOrderItems(order.items);
  const priced = orderHasPricing(items);

  // Show the pay panel for any payment-expected order (PayPanel renders the QR
  // while pending/claimed and a confirmation once paid, and polls for the flip).
  // A cancelled order must never solicit payment — gate precisely on
  // status==='cancelled' (NOT isTerminal: a *completed* order auto-confirms its
  // payment, and PayPanel then shows the intended "Payment confirmed" panel).
  // `order.payment_status` (set by qkit.place_order at order-creation time,
  // from booths.payment's still-locally-written `{kind}` marker — see
  // dashboard/booths/actions.ts) is the gate; the actual checkout render (QR/
  // link/image) now comes from paykit, not booths.payment's full content.
  const showPay =
    order.payment_status !== "not_required" && order.status !== "cancelled";
  const checkout =
    showPay && booth?.vendor_id
      ? await loadCheckoutView(booth.vendor_id, order.total_cents, order.id)
      : null;

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
              checkout={checkout}
              initialStatus={order.payment_status}
              amountCents={order.total_cents}
            />
            <div className="perforation" />
          </>
        )}

        <OrderStatusPoller
          boothId={boothId}
          orderNumber={orderNumber}
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
