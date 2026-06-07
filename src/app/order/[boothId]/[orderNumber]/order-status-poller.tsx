"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { orderRowSchema } from "@/lib/schemas";
import { OrderStatusBadge } from "@/components/order-status-badge";
import type { OrderStatus } from "@/lib/types";

const statusUpdateSchema = orderRowSchema.pick({
  order_number: true,
  status: true,
});

interface Props {
  boothId: string;
  orderNumber: string;
  initialStatus: OrderStatus;
}

const STATUS_MESSAGE: Record<OrderStatus, string> = {
  pending: "Your order is being reviewed",
  confirmed: "Your order has been confirmed",
  preparing: "Your order is being prepared",
  ready: "Your order is ready for pickup!",
  completed: "Order complete — enjoy!",
  cancelled: "Your order was cancelled",
};

export function OrderStatusPoller({
  boothId,
  orderNumber,
  initialStatus,
}: Props) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel(`order-${boothId}-${orderNumber}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `booth_id=eq.${boothId}`,
        },
        (payload) => {
          // Realtime payloads are untrusted — validate before use.
          const parsed = statusUpdateSchema.safeParse(payload.new);
          if (parsed.success && parsed.data.order_number === orderNumber) {
            setStatus(parsed.data.status);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // supabase client and setStatus are stable; only re-subscribe when the
    // booth/order identifiers change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boothId, orderNumber]);

  return (
    <div className="text-center space-y-3">
      <OrderStatusBadge status={status} />
      <p className="text-sm text-muted-foreground">{STATUS_MESSAGE[status]}</p>
      {status === "ready" && (
        <p className="font-semibold text-green-600 animate-pulse">
          Please collect your order now
        </p>
      )}
    </div>
  );
}
