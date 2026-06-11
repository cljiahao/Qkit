"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { OrderStatusBadge } from "./order-status-badge";
import { createClient } from "@/lib/supabase/client";
import { parseOrderItems } from "@/lib/schemas";
import { formatOptions, formatPrice, orderHasPricing } from "@/lib/utils";
import type { Order, OrderStatus } from "@/lib/types";

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  preparing: "ready",
  ready: "completed",
};

// Label for the advance button, keyed by the order's CURRENT status — intent,
// not the raw next-status name.
const ADVANCE_LABEL: Partial<Record<OrderStatus, string>> = {
  preparing: "Mark Ready",
  ready: "Mark Picked Up",
};

export function OrderCard({
  order,
  boothName,
}: {
  order: Order;
  boothName?: string;
}) {
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
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <OrderStatusBadge status={status} />
          {boothName && (
            <span className="max-w-[8rem] truncate rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-secondary-foreground">
              {boothName}
            </span>
          )}
        </div>
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
            {formatOptions(item.options) && (
              <p className="pl-5 text-xs text-muted-foreground">
                {formatOptions(item.options)}
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
                {ADVANCE_LABEL[status]}
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-lg text-muted-foreground hover:text-destructive"
                  disabled={updating}
                >
                  Cancel
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Cancel order #{order.order_number}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently cancels the order and removes it from the
                    board. This can&apos;t be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={updating}>
                    Keep order
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={cancelOrder}
                    disabled={updating}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    Cancel order
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        <p className="border-t border-border/60 px-4 py-2 text-right font-mono text-[0.7rem] text-muted-foreground">
          {new Date(order.created_at).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
