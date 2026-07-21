"use client";

import { useEffect, useRef, useState } from "react";
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
  revertOrderAdvance,
  restoreAutoCompleted,
} from "@/app/dashboard/order-actions";
import { sgtClock, shortDateTime } from "@/lib/tz";
import { useNow } from "@/hooks/use-now";
import { useAsyncAction } from "@/hooks/use-async-action";
import { Banknote, ChevronDown, Clock, Undo2, Zap } from "lucide-react";
import type { BoardOrder, OrderStatus, PaymentStatus } from "@/lib/types";

// Undo window for advanceStatus (Mark Ready / Mark Picked Up) — instant tap,
// no hold-to-confirm gate (research: confirmation friction on a high-frequency
// action causes habituation and increases errors instead of preventing them),
// backed instead by a short, visible undo. Matches Square KDS's own 3s undo on
// its equivalent complete action; vendor-configurable (board_settings.
// undo_seconds) via the `undoMs` prop, this 4s is just the fallback.
const DEFAULT_UNDO_MS = 4000;

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
  displayNumber,
  boothName,
  agingMin,
  overdueMin,
  onUndoWindowChange,
  showDate = false,
  undoMs = DEFAULT_UNDO_MS,
}: {
  order: BoardOrder;
  // board_settings.daily_order_number_reset display number (see
  // displayOrderNumber in @/lib/orders) — falls back to the real, permanent
  // order_number when omitted (e.g. the completed-orders history list, which
  // deliberately never gets one; see its own README for why).
  displayNumber?: string;
  boothName?: string;
  // Vendor-configurable board_settings thresholds (see /dashboard/settings).
  // Fall through to orderAgeTone's own defaults when not supplied.
  agingMin?: number;
  overdueMin?: number;
  // Notifies the board while an advance's undo window is open, so it can
  // keep a just-completed order (a terminal status, normally filtered off
  // the active board) visible until the window closes — otherwise the
  // realtime echo of the very advance being undone could unmount this card
  // out from under the undo button. No-op when omitted (e.g. the completed-
  // orders history list, which never calls advanceStatus in the first place).
  onUndoWindowChange?: (orderId: string, active: boolean) => void;
  // board_settings.undo_seconds * 1000, vendor-configurable. Falls back to
  // DEFAULT_UNDO_MS when omitted (e.g. before the board thread it through).
  undoMs?: number;
  // Footer stamp reads a bare time ("2:38 AM") by default — fine for the
  // live board, where every card is from today. A history list spans many
  // days, so it opts into a date+time stamp instead of a time an ordering
  // vendor would have to guess the day for.
  showDate?: boolean;
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

  // A just-tapped advanceStatus sits here until the undo window closes (timer
  // in undoTimerRef) or the vendor taps Undo. Cleared on unmount too, so a
  // card that scrolls out of view (or the completed order finally leaving the
  // board once the window ends) never fires a late setState.
  const [pendingUndo, setPendingUndo] = useState<{
    revertTo: OrderStatus;
    revertFrom: OrderStatus;
    prevPaymentStatus: PaymentStatus;
  } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  // Ticket aging: tick the clock each 30s (only while live) so the vendor sees
  // at a glance how long an order has waited against a ~10-min prep target.
  const nowMs = useNow(30_000, !isTerminal(status));
  const elapsedMs = nowMs - Date.parse(order.created_at);
  const tone = orderAgeTone(elapsedMs, agingMin, overdueMin);
  const ageMins = elapsedMinutes(elapsedMs);
  const items = parseOrderItems(order.items);
  const priced = orderHasPricing(items);
  // What's actually printed on this ticket — the daily-reset display number
  // when supplied, else the real one. Used everywhere the card refers to
  // "this order" by number, including its own confirm dialogs: a vendor
  // reading "order #3" off the card shouldn't then see "#0847" in the
  // dialog asking them to confirm it.
  const number = displayNumber ?? order.order_number;
  const advance = ADVANCE[status];
  const hasOptions = items.some((it) => (it.options?.length ?? 0) > 0);

  // A dismissed/expired undo window just clears local state — the DB write
  // it's undoing (or not) already happened; there's nothing left to do here.
  function dismissUndo(orderId: string) {
    setPendingUndo(null);
    onUndoWindowChange?.(orderId, false);
  }

  // All mutations go through validated server actions (order-actions.ts); the
  // DB enforces ownership (RLS) and column integrity (a freeze trigger).
  function advanceStatus() {
    if (!advance) return;
    const revertTo = status;
    const prevPaymentStatus = order.payment_status;
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
          (prevPaymentStatus === "pending" || prevPaymentStatus === "claimed")
        )
          setConfirmedLocally(true);

        // Instant tap, no confirm gate — a short undo window is the recovery
        // path instead (see undoMs). onUndoWindowChange keeps a just-
        // completed order on the active board for this window; without it,
        // the realtime echo of this very write would filter the card off the
        // board before the vendor could react to a mis-tap.
        setPendingUndo({ revertTo, revertFrom: res.status, prevPaymentStatus });
        onUndoWindowChange?.(order.id, true);
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = setTimeout(() => dismissUndo(order.id), undoMs);
      }
    });
  }

  function undoAdvance() {
    if (!pendingUndo) return;
    const { revertTo, revertFrom, prevPaymentStatus } = pendingUndo;
    const orderId = order.id;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    return run(async () => {
      const res = await revertOrderAdvance(
        orderId,
        revertTo,
        revertFrom,
        prevPaymentStatus,
      );
      if (!res.success) {
        toast.error(res.error);
      } else {
        setStatus(res.status);
        if (
          revertFrom === "completed" &&
          (prevPaymentStatus === "pending" || prevPaymentStatus === "claimed")
        )
          setConfirmedLocally(false);
      }
      // Clearing the local pendingUndo is enough to restore this card's own
      // buttons — status is no longer terminal, so `closed` already flips
      // false. Releasing the board's keep-alive override is delayed instead
      // of immediate: the board's `orders` (realtime-sourced) still reads
      // "completed" until THIS revert's own echo lands, so releasing right
      // away risks a one-frame flicker where the card gets filtered off the
      // board before it flips back.
      setPendingUndo(null);
      setTimeout(() => onUndoWindowChange?.(orderId, false), 1000);
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

  function restoreToReady() {
    return run(async () => {
      const res = await restoreAutoCompleted(order.id);
      if (!res.success) toast.error(res.error);
      else setStatus(res.status);
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
      )}
    >
      {/* A full-width booth banner instead of squeezing the name into a
          corner icon/tab — those blocked or truncated past readability. In
          normal flow (not absolutely positioned) so it can't overlap the
          name/number block below it, and the full card width means a
          booth's actual name reads at a glance instead of being guessed
          from a dot. Same boothColor() hash as the filter tabs/dropdown, so
          the colour association still carries onto the card. Only rendered
          in multi-booth view. */}
      {boothName && (
        <div className="flex items-center gap-1.5 rounded-t-xl border-b border-border/60 bg-secondary/40 px-4 py-1.5">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: boothColor(order.booth_id) }}
          />
          <span className="truncate text-xs font-semibold tracking-wide text-foreground uppercase">
            {boothName}
          </span>
        </div>
      )}
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
                  #{number}
                  <Zap
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {order.customer_name}
                </p>
                <p className="mt-1.5 text-[0.55rem] font-medium uppercase tracking-wider text-muted-foreground/50">
                  Tap to bump
                </p>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Bump order #{number} to front?
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
              #{number}
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

        {/* Stays visible through a pending undo window even once `closed`
            (e.g. a just-completed order) — otherwise the undo affordance
            itself would vanish along with the row. */}
        {(!closed || pendingUndo) && (
          <div className="flex gap-2 px-4 pb-4">
            {pendingUndo && status === pendingUndo.revertFrom ? (
              // Instant tap, no confirm gate on the advance itself — this is
              // the recovery path instead: a few seconds to catch a mis-tap,
              // draining left-to-right so the deadline is visible at a glance.
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="relative h-11 flex-1 overflow-hidden rounded-lg font-semibold"
                onClick={undoAdvance}
                disabled={updating}
              >
                <span
                  className="undo-bar absolute inset-y-0 left-0 bg-secondary"
                  style={{ animationDuration: `${undoMs}ms` }}
                  aria-hidden="true"
                />
                <span className="relative flex items-center gap-1.5">
                  <Undo2 className="size-4" /> Undo
                </span>
              </Button>
            ) : (
              <>
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
                          Cancel order #{number}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently cancels the order and removes it from
                          the board. This can&apos;t be undone.
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
              </>
            )}
          </div>
        )}

        {closed && !pendingUndo && order.auto_completed && (
          <div className="flex gap-2 px-4 pb-4">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-11 flex-1 rounded-lg font-semibold"
              onClick={restoreToReady}
              disabled={updating}
            >
              <Undo2 className="size-4" /> Restore to ready
            </Button>
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
          <span>
            {showDate
              ? shortDateTime(order.created_at)
              : sgtClock(order.created_at)}
          </span>
        </div>
      </div>
    </Ticket>
  );
}
