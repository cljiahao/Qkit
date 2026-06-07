import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { formatPrice } from "@/lib/utils";
import { parseOrderItems } from "@/lib/schemas";
import { OrderStatusPoller } from "./order-status-poller";

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
    .select("name")
    .eq("id", boothId)
    .single();

  const items = parseOrderItems(order.items);

  return (
    <div className="min-h-screen max-w-sm mx-auto p-4 flex flex-col">
      <header className="mb-8 text-center">
        <p className="text-sm text-muted-foreground">{booth?.name}</p>
        <h1 className="text-5xl font-bold font-mono mt-1">
          #{order.order_number}
        </h1>
        <p className="text-muted-foreground mt-2">
          Order for {order.customer_name}
        </p>
      </header>

      <div className="flex justify-center mb-8">
        <OrderStatusBadge status={order.status} />
      </div>

      <section className="space-y-2 mb-8">
        {items.map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span>
              {item.quantity}× {item.name}
            </span>
            <span className="text-muted-foreground">
              {formatPrice(item.price_cents * item.quantity)}
            </span>
          </div>
        ))}
        <div className="flex justify-between font-semibold pt-2 border-t">
          <span>Total</span>
          <span>{formatPrice(order.total_cents)}</span>
        </div>
      </section>

      <OrderStatusPoller
        boothId={boothId}
        orderNumber={orderNumber}
        initialStatus={order.status}
      />

      <div className="mt-auto pt-8 text-center">
        <Link
          href={`/order/${boothId}`}
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          Order again
        </Link>
      </div>
    </div>
  );
}
