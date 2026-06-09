"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "./order-status-badge";
import { createClient } from "@/lib/supabase/client";
import { parseOrderItems } from "@/lib/schemas";
import { formatPrice, orderHasPricing } from "@/lib/utils";
import type { Order, OrderStatus } from "@/lib/types";

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "completed",
};

export function OrderCard({ order }: { order: Order }) {
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [updating, setUpdating] = useState(false);
  const supabase = createClient();
  const items = parseOrderItems(order.items);
  const priced = orderHasPricing(items);
  const nextStatus = NEXT_STATUS[status];

  async function advanceStatus() {
    if (!nextStatus) return;
    setUpdating(true);
    const { error } = await supabase
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", order.id);

    if (error) {
      toast.error("Failed to update order");
    } else {
      setStatus(nextStatus);
    }
    setUpdating(false);
  }

  async function cancelOrder() {
    setUpdating(true);
    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", order.id);

    if (error) {
      toast.error("Failed to cancel order");
    } else {
      setStatus("cancelled");
    }
    setUpdating(false);
  }

  const closed = status === "completed" || status === "cancelled";

  return (
    <div className="ticket flex w-full flex-col overflow-hidden rounded-xl border border-border shadow-[0_1px_0_0_var(--color-border),0_12px_28px_-20px_oklch(0.4_0.06_45/0.4)]">
      <div className="flex items-start justify-between gap-3 px-4 pt-5 pb-3">
        <div className="min-w-0">
          <p className="font-mono text-xl font-bold tracking-tight">
            #{order.order_number}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {order.customer_name}
          </p>
        </div>
        <OrderStatusBadge status={status} />
      </div>

      <div className="perforation mx-4" />

      <div className="space-y-1.5 px-4 py-3">
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
            {item.options && item.options.length > 0 && (
              <p className="pl-5 text-xs text-muted-foreground">
                {item.options.map((o) => o.choice).join(" · ")}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-auto">
        {priced && (
          <>
            <div className="perforation mx-4" />
            <div className="flex items-baseline justify-between px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total
              </span>
              <span className="font-mono text-lg font-bold">
                {formatPrice(order.total_cents)}
              </span>
            </div>
          </>
        )}

        {!closed && (
          <div className="flex gap-2 px-4 pb-4">
            {nextStatus && (
              <Button
                size="sm"
                className="h-9 flex-1 rounded-lg font-semibold"
                onClick={advanceStatus}
                disabled={updating}
              >
                Mark {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-lg text-muted-foreground hover:text-destructive"
              onClick={cancelOrder}
              disabled={updating}
            >
              Cancel
            </Button>
          </div>
        )}

        <p className="border-t border-border/60 px-4 py-2 text-right font-mono text-[0.7rem] text-muted-foreground">
          {new Date(order.created_at).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
