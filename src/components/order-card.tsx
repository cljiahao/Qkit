"use client";

import { useMemo, useState } from "react";
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
import { cn, formatOptions, formatPrice, orderHasPricing } from "@/lib/utils";
import { boothColor } from "@/lib/booth-color";
import { isTerminal } from "@/lib/orders";
import { ChevronDown } from "lucide-react";
import type { Order, OrderStatus } from "@/lib/types";

// Forward transition keyed by the order's CURRENT status: where the advance
// button takes it (next) and what it says (label = intent, not the raw name).
const ADVANCE: Partial<
  Record<OrderStatus, { next: OrderStatus; label: string }>
> = {
  preparing: { next: "ready", label: "Mark Ready" },
  ready: { next: "completed", label: "Mark Picked Up" },
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
  const [expanded, setExpanded] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const items = parseOrderItems(order.items);
  const priced = orderHasPricing(items);
  const advance = ADVANCE[status];
  const hasOptions = items.some((it) => (it.options?.length ?? 0) > 0);

  async function advanceStatus() {
    if (!advance) return;
    setUpdating(true);
    const { error } = await supabase
      .from("orders")
      .update({ status: advance.next })
      .eq("id", order.id);

    if (error) {
      toast.error("Failed to update order");
    } else {
      setStatus(advance.next);
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

  const closed = isTerminal(status);

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
            <span className="inline-flex max-w-[8rem] items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-secondary-foreground">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: boothColor(order.booth_id) }}
              />
              <span className="truncate">{boothName}</span>
            </span>
          )}
        </div>
      </div>

      <div className="perforation mx-4" />

      <div className="px-4 py-3">
        <div className="space-y-1.5">
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
              {(item.options?.length ?? 0) > 0 &&
                (expanded ? (
                  <ul className="mt-0.5 space-y-0.5 pl-5 text-xs text-muted-foreground">
                    {(item.options ?? []).map((o, j) => (
                      <li key={j} className="flex justify-between gap-3">
                        <span className="font-medium text-foreground/70">
                          {o.group}:
                        </span>
                        <span className="text-right text-foreground/90">
                          {o.choice}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="truncate pl-5 text-xs text-muted-foreground">
                    {formatOptions(item.options)}
                  </p>
                ))}
            </div>
          ))}
        </div>

        {hasOptions && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-md py-1 text-[0.7rem] font-medium text-muted-foreground transition-colors hover:bg-secondary/50"
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                expanded && "rotate-180",
              )}
            />
            {expanded ? "Hide options" : "Show options"}
          </button>
        )}
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
            {advance && (
              <Button
                size="sm"
                className="h-9 flex-1 rounded-lg font-semibold"
                onClick={advanceStatus}
                disabled={updating}
              >
                {advance.label}
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
