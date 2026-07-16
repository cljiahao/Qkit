import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getOrCreateVendorProfile,
  type VendorProfile,
} from "@/lib/merqo-vendor-profile";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { Ticket } from "@/components/ticket";
import { formatOptions, formatPrice, orderHasPricing } from "@/lib/utils";
import {
  orderBoothIdSchema,
  orderNumberSchema,
  orderTokenSchema,
  parseOrderItems,
  parsePaymentConfig,
  parseSocialLinks,
  resolveSocialLinks,
} from "@/lib/schemas";
import { renderCheckout } from "@/lib/payments/adapters";
import { FeedbackForm } from "@/components/feedback-form";
import { ReorderButton } from "@/components/reorder-button";
import { OrderStatusPoller } from "./order-status-poller";
import { PayPanel } from "./pay-panel";
import { EarnLink } from "./earn-link";
import { SocialLinksRow } from "./social-links-row";

interface Props {
  params: Promise<{ boothId: string; orderNumber: string }>;
  searchParams: Promise<{ t?: string }>;
}

export const revalidate = 0;

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
        .select("name, payment, vendor_id, social_links")
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
  //
  // Unlike get-entitlement's fail-loud convention, a failure here must NOT
  // take down the page: this is a customer holding a valid, paid order link,
  // and the vendor-level links are a decorative footer, not load-bearing.
  // Degrade to booth-only links (or none) on any RPC error rather than throw
  // — same "don't strand a customer on a DB/network blip" philosophy as the
  // orderError handling above.
  let vendorProfile: VendorProfile | null = null;
  if (booth?.vendor_id) {
    try {
      vendorProfile = await getOrCreateVendorProfile(
        supabase,
        booth.vendor_id,
        null,
      );
    } catch (err) {
      console.error(
        "order-status: vendor profile read failed",
        err instanceof Error ? err.message : err,
      );
    }
  }
  const socialLinks = resolveSocialLinks(
    booth?.social_links ? parseSocialLinks(booth.social_links) : null,
    parseSocialLinks(vendorProfile?.social_links ?? null),
  );

  const items = parseOrderItems(order.items);
  const priced = orderHasPricing(items);

  const paymentConfig = parsePaymentConfig(booth?.payment);
  // Show the pay panel for any payment-expected order (PayPanel renders the QR
  // while pending/claimed and a confirmation once paid, and polls for the flip).
  // A cancelled order must never solicit payment — gate precisely on
  // status==='cancelled' (NOT isTerminal: a *completed* order auto-confirms its
  // payment, and PayPanel then shows the intended "Payment confirmed" panel).
  const showPay =
    paymentConfig != null &&
    order.payment_status !== "not_required" &&
    order.status !== "cancelled";
  const checkout = showPay
    ? renderCheckout(paymentConfig, {
        amountCents: order.total_cents,
        orderRef: order.order_number,
      })
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
            #{order.order_number}
          </h1>
          <p className="mt-3 text-muted-foreground">
            for {order.customer_name}
          </p>
        </header>

        <div className="perforation" />

        <OrderStatusPoller
          boothId={boothId}
          orderNumber={orderNumber}
          token={token}
          initialStatus={order.status}
          boothName={booth?.name ?? "Your order"}
          placedAt={order.created_at}
        />

        <div className="perforation" />

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
                    {formatPrice((item.price_cents ?? 0) * item.quantity)}
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

      <div className="mt-6">
        <FeedbackForm
          source="customer"
          boothId={boothId}
          orderNumber={orderNumber}
          token={token}
          prompt="How was ordering here?"
        />
      </div>

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
        <SocialLinksRow links={socialLinks} />
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
