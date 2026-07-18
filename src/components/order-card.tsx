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
import { Ticket } from "@/components/ticket";
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
  bumpOrder,
  cancelOrder as cancelOrderAction,
  confirmOrderPayment,
} from "@/app/dashboard/order-actions";
import { sgtClock } from "@/lib/tz";
import { useNow } from "@/hooks/use-now";
import { useAsyncAction } from "@/hooks/use-async-action";
import { Banknote, ChevronDown, Clock, Zap } from "lucide-react";
import type { BoardOrder, OrderStatus } from "@/lib/types";

function PaymentBadge({ status }: { status: BoardOrder["payment_status"] }) {
  if (status === "not_required") return null;
  const map = {
    pending: { label: "Unpaid", cls: "bg-secondary text-foreground" },
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
  agingMin,
  overdueMin,
}: {
  order: BoardOrder;
  boothName?: string;
  // Vendor-configurable board_settings thresholds (see /dashboard/settings).
  // Fall through to orderAgeTone's own defaults when not supplied.
  agingMin?: number;
  overdueMin?: number;
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
  // Same optimistic-then-realtime-confirmed pattern as confirmedLocally above —
  // an instant "bumped" state for the vendor who tapped it, superseded by the
  // realtime-updated prop once that echo arrives (or reflecting another
  // session's bump immediately, without waiting on this one's own tap).
  const [bumpedLocally, setBumpedLocally] = useState(false);
  const bumped = bumpedLocally || order.priority_bumped_at != null;
  const { pending: updating, run } = useAsyncAction();
  const [expanded, setExpanded] = useState(false);

  // Ticket aging: tick the clock each 30s (only while live) so the vendor sees
  // at a glance how long an order has waited against a ~10-min prep target.
  const nowMs = useNow(30_000, !isTerminal(status));
  const elapsedMs = nowMs - Date.parse(order.created_at);
  const tone = orderAgeTone(elapsedMs, agingMin, overdueMin);
  const ageMins = elapsedMinutes(elapsedMs);
  const items = parseOrderItems(order.items);
  const priced = orderHasPricing(items);
  const advance = ADVANCE[status];
  const hasOptions = items.some((it) => (it.options?.length ?? 0) > 0);

  // All three mutations go through validated server actions (order-actions.ts);
  // the DB enforces ownership (RLS) and column integrity (a freeze trigger).
  function advanceStatus() {
    if (!advance) return;
    return run(async () => {
      const res = await advanceOrder(order.id);
      if (!res.success) {
        toast.error(res.error);
      } else {
        setStatus(res.status);
        // Mirrors buildAdvancePatch: only a payment that was actually
        // outstanding gets auto-confirmed on completion. A `not_required`
        // order has nothing to confirm — flagging it anyway would pop a
        // stray "Paid" badge into the aging-clock's spot for one frame.
        if (
          res.status === "completed" &&
          (order.payment_status === "pending" ||
            order.payment_status === "claimed")
        )
          setConfirmedLocally(true);
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

  function bump() {
    return run(async () => {
      const res = await bumpOrder(order.id);
      if (!res.success) toast.error(res.error);
      else setBumpedLocally(true);
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
    <Ticket
      radius="xl"
      shadow="none"
      borderColor="custom"
      className={cn(
        "flex w-full flex-col shadow-[0_1px_0_0_var(--color-border),0_12px_28px_-20px_oklch(0.4_0.06_45/0.4)]",
        wash,
        // A per-booth colour stripe — same boothColor() hash already used for
        // the filter tabs and the booth pill below, so a staffer's "this
        // colour = my booth" association carries straight over onto the
        // card. Only rendered when boothName is (i.e. the vendor actually
        // has multiple booths); a single-booth card has nothing to
        // disambiguate. Thin on purpose so it doesn't compete with `wash`,
        // which carries the higher-priority overdue/aging/payment signal.
        boothName && "border-l-4",
      )}
      style={
        boothName ? { borderLeftColor: boothColor(order.booth_id) } : undefined
      }
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-5 pb-3">
        {/* The name/number block doubles as the bump affordance: tapping it
            prompts a confirmation instead of sitting as a separate icon
            button next to Mark ready, where an accidental tap advanced the
            wrong thing. Not tappable once already bumped (re-tap would just
            refresh the timestamp with no visible change) or once closed. */}
        {!closed && !bumped ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="-mx-2 -my-1 min-w-0 rounded-lg border border-dashed border-muted-foreground/40 bg-secondary/40 px-2 py-1 text-left transition-colors hover:border-primary/50 hover:bg-secondary"
                disabled={updating}
              >
                <p className="flex items-center gap-1.5 font-mono text-xl font-bold tracking-tight">
                  #{order.order_number}
                  <Zap
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {order.customer_name}
                </p>
                <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Tap to bump
                </p>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Bump order #{order.order_number} to front?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Moves this order ahead of the others still waiting in the
                  queue.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={updating}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction onClick={bump} disabled={updating}>
                  Bump to front
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-mono text-xl font-bold tracking-tight">
              #{order.order_number}
              {!closed && bumped && (
                <Zap
                  className="size-4 shrink-0 text-primary"
                  aria-label="Manually bumped to the front of the queue"
                />
              )}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {order.customer_name}
            </p>
          </div>
        )}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <OrderStatusBadge status={status} />
          <PaymentBadge status={payStatus} />
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
                    {item.price_cents == null
                      ? "Free"
                      : formatPrice(item.price_cents * item.quantity)}
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
            {/* No cancel affordance once payment is confirmed — there's no
                refund rail, so a paid order can only be refunded off-platform
                (the server action rejects the cancel too). */}
            {payStatus !== "confirmed" && (
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
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border/60 px-4 py-2 font-mono text-[0.7rem] text-muted-foreground">
          {!closed ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 font-semibold tabular-nums",
                tone === "overdue"
                  ? "text-status-cancelled"
                  : tone === "aging"
                    ? "text-amber-600"
                    : "text-muted-foreground",
              )}
              title="Time since the order arrived"
              aria-label={`${ageMins} minutes since arrival${
                tone === "overdue"
                  ? ", overdue"
                  : tone === "aging"
                    ? ", getting old"
                    : ""
              }`}
            >
              <Clock className="size-3" />
              {ageMins}m
            </span>
          ) : (
            <span />
          )}
          <span>{sgtClock(order.created_at)}</span>
        </div>
      </div>
    </Ticket>
  );
}
