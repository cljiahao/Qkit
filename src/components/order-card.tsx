"use client";

import { useEffect, useState } from "react";
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
import { OrderStatusBadge } from "@/components/order-status-badge";
import { parseOrderItems } from "@/lib/schemas";
import { cn, formatOptions, formatPrice, orderHasPricing } from "@/lib/utils";
import { boothColor } from "@/lib/booth-color";
import {
  ADVANCE,
  isTerminal,
  orderAgeTone,
  elapsedMinutes,
} from "@/lib/orders";
import {
  advanceOrder,
  cancelOrder as cancelOrderAction,
  confirmOrderPayment,
} from "@/app/dashboard/order-actions";
import { sgtClock } from "@/lib/tz";
import { useNow } from "@/hooks/use-now";
import { useAsyncAction } from "@/hooks/use-async-action";
import { Banknote, ChevronDown, Clock } from "lucide-react";
import type { Order, OrderStatus } from "@/lib/types";

function PaymentBadge({ status }: { status: Order["payment_status"] }) {
  if (status === "not_required") return null;
  const map = {
    pending: { label: "Unpaid", cls: "bg-secondary text-muted-foreground" },
    // Filled, high-contrast — the actionable state.
    claimed: { label: "Says paid", cls: "bg-blue-600 text-white" },
    confirmed: { label: "Paid", cls: "bg-emerald-600 text-white" },
  } as const;
  const v = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider",
        v.cls,
      )}
    >
      {v.label}
    </span>
  );
}

export function OrderCard({
  order,
  boothName,
}: {
  order: Order;
  boothName?: string;
}) {
  const [status, setStatus] = useState<OrderStatus>(order.status);
  // Resync to the (realtime-updated) prop when it actually changes value, so a
  // remote status change (another device advancing/cancelling) reflects on the
  // card. An optimistic local setStatus doesn't change the prop, so it survives
  // until its own realtime echo arrives and this no-ops.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus(order.status);
  }, [order.status]);
  // Payment status is driven by the (realtime-updated) prop so a customer's
  // remote "I've paid" claim appears live on the board. A local flag only
  // covers the vendor's own confirm tap for instant feedback before the
  // realtime echo arrives.
  const [confirmedLocally, setConfirmedLocally] = useState(false);
  const payStatus = confirmedLocally ? "confirmed" : order.payment_status;
  const { pending: updating, run } = useAsyncAction();
  const [expanded, setExpanded] = useState(false);

  // Ticket aging: tick the clock each 30s (only while live) so the vendor sees
  // at a glance how long an order has waited against a ~10-min prep target.
  const nowMs = useNow(30_000, !isTerminal(status));
  const elapsedMs = nowMs - Date.parse(order.created_at);
  const tone = orderAgeTone(elapsedMs);
  const ageMins = elapsedMinutes(elapsedMs);
  const items = parseOrderItems(order.items);
  const priced = orderHasPricing(items);
  const advance = ADVANCE[status];
  const hasOptions = items.some((it) => (it.options?.length ?? 0) > 0);

  // All three mutations go through validated server actions (order-actions.ts);
  // the DB enforces ownership (RLS) and column integrity (0032 freeze trigger).
  function advanceStatus() {
    if (!advance) return;
    return run(async () => {
      const res = await advanceOrder(order.id);
      if (!res.success) {
        toast.error(res.error);
      } else {
        setStatus(res.status);
        // Completing auto-confirms an outstanding payment (see buildAdvancePatch).
        if (res.status === "completed") setConfirmedLocally(true);
      }
    });
  }

  function confirmPayment() {
    return run(async () => {
      const res = await confirmOrderPayment(order.id);
      if (!res.success) toast.error(res.error);
      else setConfirmedLocally(true);
    });
  }

  function cancelOrder() {
    return run(async () => {
      const res = await cancelOrderAction(order.id);
      if (!res.success) {
        toast.error(res.error);
      } else {
        setStatus("cancelled");
      }
    });
  }

  const closed = isTerminal(status);

  // One full-card attention wash at a time, by priority. A background (not a
  // border) so the colour reaches the scalloped receipt top edge instead of
  // being broken by it; plain .ticket-* classes so they beat .ticket's own
  // unlayered background. Overdue (late food) outranks an unconfirmed payment,
  // which outranks merely aging.
  const wash =
    !closed && tone === "overdue"
      ? "ticket-overdue"
      : payStatus === "claimed"
        ? "ticket-alert"
        : !closed && tone === "aging"
          ? "ticket-aging"
          : "border-border";

  return (
    <div
      className={cn(
        "ticket flex w-full flex-col overflow-hidden rounded-xl border shadow-[0_1px_0_0_var(--color-border),0_12px_28px_-20px_oklch(0.4_0.06_45/0.4)]",
        wash,
      )}
    >
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
          <PaymentBadge status={payStatus} />
          {!closed && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[0.7rem] font-semibold tabular-nums",
                tone === "overdue"
                  ? "text-status-cancelled"
                  : tone === "aging"
                    ? "text-amber-600"
                    : "text-muted-foreground",
              )}
              title="Time since the order arrived"
            >
              <Clock className="size-3" />
              {ageMins}m
            </span>
          )}
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

        {/* Payment prompts only while the order is live — a cancelled/completed
            order must not solicit or re-confirm payment. */}
        {!closed && payStatus === "claimed" && (
          <div className="px-4 pb-3">
            <Button
              className="h-12 w-full rounded-lg bg-blue-600 text-base font-bold text-white hover:bg-blue-700"
              onClick={confirmPayment}
              disabled={updating}
            >
              <Banknote className="size-5" /> Confirm payment received
            </Button>
          </div>
        )}
        {!closed && payStatus === "pending" && (
          <div className="px-4 pb-3">
            <Button
              size="sm"
              variant="outline"
              className="h-10 w-full rounded-lg text-muted-foreground"
              onClick={confirmPayment}
              disabled={updating}
            >
              Mark as paid
            </Button>
          </div>
        )}

        {!closed && (
          <div className="flex gap-2 px-4 pb-4">
            {advance && (
              <Button
                size="sm"
                className="h-11 flex-1 rounded-lg font-semibold"
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
                  className="h-11 rounded-lg text-muted-foreground hover:text-destructive"
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
          {sgtClock(order.created_at)}
        </p>
      </div>
    </div>
  );
}
