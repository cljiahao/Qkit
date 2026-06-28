import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { formatOptions, formatPrice, orderHasPricing } from "@/lib/utils";
import { parseOrderItems, parsePaymentConfig } from "@/lib/schemas";
import { renderCheckout } from "@/lib/payments/adapters";
import { FeedbackForm } from "@/components/feedback-form";
import { ReorderButton } from "@/components/reorder-button";
import { OrderStatusPoller } from "./order-status-poller";
import { PayPanel } from "./pay-panel";

interface Props {
  params: Promise<{ boothId: string; orderNumber: string }>;
}

export const revalidate = 0;

export default async function OrderStatusPage({ params }: Props) {
  const { boothId, orderNumber } = await params;

  // Service client bypasses RLS — customers are unauthenticated
  const supabase = await createServiceClient();

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .single();

  if (!order) notFound();

  const { data: booth } = await supabase
    .from("booths")
    .select("name, payment")
    .eq("id", boothId)
    .single();

  const items = parseOrderItems(order.items);
  const priced = orderHasPricing(items);

  // Show the pay panel only while payment is still outstanding for a booth that
  // has a method configured.
  const paymentConfig = parsePaymentConfig(booth?.payment);
  // Show the pay panel for any payment-expected order (PayPanel renders the QR
  // while pending/claimed and a confirmation once paid, and polls for the flip).
  const showPay =
    paymentConfig != null && order.payment_status !== "not_required";
  const checkout = showPay
    ? renderCheckout(paymentConfig, {
        amountCents: order.total_cents,
        orderRef: order.order_number,
      })
    : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col px-5 py-10">
      <div className="ticket overflow-hidden rounded-2xl border border-border shadow-[0_2px_0_0_var(--color-border),0_18px_40px_-24px_oklch(0.4_0.06_45/0.45)]">
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
          initialStatus={order.status}
          boothName={booth?.name ?? "Your order"}
        />

        <div className="perforation" />

        {showPay && (
          <>
            <PayPanel
              boothId={boothId}
              orderNumber={orderNumber}
              checkout={checkout}
              initialStatus={order.payment_status}
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
      </div>

      <div className="mt-6">
        <FeedbackForm
          source="customer"
          boothId={boothId}
          orderNumber={orderNumber}
          prompt="How was ordering here?"
        />
      </div>

      <div className="mt-auto flex flex-col items-center gap-3 pt-8">
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
          Order again
        </Link>
      </div>
    </div>
  );
}
