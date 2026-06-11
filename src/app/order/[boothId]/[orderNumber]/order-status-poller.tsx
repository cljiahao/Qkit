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

// Live flow is preparing → ready (2 steps). STATUS_MESSAGE retains the legacy
// pending/confirmed keys so any pre-v2 order still renders a message.
const STEPS: OrderStatus[] = ["preparing", "ready"];

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

  const completed = status === "completed";
  const cancelled = status === "cancelled";
  // completed sits past the last step; cancelled has no progress.
  const activeIndex = completed ? STEPS.length - 1 : STEPS.indexOf(status);

  return (
    <div className="space-y-5 px-6 py-6 text-center">
      <div className="flex justify-center">
        <OrderStatusBadge status={status} />
      </div>

      {!cancelled && (
        <div className="flex items-center gap-1.5">
          {STEPS.map((step, i) => (
            <div
              key={step}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= activeIndex ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>
      )}

      <p
        className={`font-display text-xl font-semibold ${
          status === "ready" ? "text-status-ready" : ""
        }`}
      >
        {STATUS_MESSAGE[status]}
      </p>

      {status === "ready" && (
        <p className="animate-pulse text-sm font-medium text-status-ready">
          Please collect your order now
        </p>
      )}
    </div>
  );
}
