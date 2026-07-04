import type { Order, OrderStatus, PaymentStatus } from "@/lib/types";

// A finished order — off the active board, no further transitions. Single
// source of truth for the "is this done" check that several views need.
export const TERMINAL_STATUSES: OrderStatus[] = ["completed", "cancelled"];

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Forward transition keyed by an order's CURRENT status: where the advance
 * button takes it (`next`) and what the button says (`label` = intent, not the
 * raw status name). A status with no entry has no legal forward move. Shared by
 * the order board (button) and the `advanceOrder` server action (patch) so both
 * derive the next state from one source.
 */
export const ADVANCE: Partial<
  Record<OrderStatus, { next: OrderStatus; label: string }>
> = {
  preparing: { next: "ready", label: "Mark Ready" },
  ready: { next: "completed", label: "Mark Picked Up" },
};

// Active-board ordering. Lower rank = higher on the board. Only the statuses
// that appear on the active board are ranked meaningfully; terminal/legacy
// statuses fall to the end so a stray order never sorts above live work.
const STATUS_RANK: Record<OrderStatus, number> = {
  preparing: 0,
  ready: 1,
  pending: 2,
  confirmed: 2,
  completed: 3,
  cancelled: 3,
};

// Customer-facing progress for the status page's segmented bar: placed →
// cooking → ready. pending/confirmed light the first segment so the earliest,
// most anxious wait still shows movement; cancelled has no progress.
export const ORDER_PROGRESS_SEGMENTS = 3;
export function orderProgressIndex(status: OrderStatus): number {
  switch (status) {
    case "pending":
    case "confirmed":
      return 0;
    case "preparing":
      return 1;
    case "ready":
    case "completed":
      return 2;
    default:
      return -1; // cancelled — no progress
  }
}

export type AgeTone = "fresh" | "aging" | "overdue";

/**
 * Ticket-aging tone for the live board, relative to a prep-time target (default
 * 10 min, per KDS norms). < half the target = fresh, up to the target = aging,
 * at/over = overdue. Pair the tone with the elapsed text + an icon in the UI —
 * never rely on color alone (WCAG 1.4.1). Pure.
 */
export function orderAgeTone(elapsedMs: number, targetMin = 10): AgeTone {
  const min = elapsedMs / 60_000;
  if (min < targetMin / 2) return "fresh";
  if (min < targetMin) return "aging";
  return "overdue";
}

/** Whole-minute elapsed label for a ticket, floored at 0. */
export function elapsedMinutes(elapsedMs: number): number {
  return Math.max(0, Math.floor(elapsedMs / 60_000));
}

/**
 * Human "time since" label for a customer (e.g. "just now", "5 min ago",
 * "1 hr 20 min ago"). Coarse on purpose — the customer wants a sense that the
 * wait is tracked, not second precision. Floored at 0. Pure.
 */
export function elapsedLabel(elapsedMs: number): string {
  const min = elapsedMinutes(elapsedMs);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${hrs} hr ago` : `${hrs} hr ${rem} min ago`;
}

/**
 * The DB patch for advancing an order to `next`: the new status plus the
 * transition timestamp it stamps — ready_at on entering "ready", completed_at on
 * "completed", neither otherwise. Pure: `nowIso` is passed in (no Date here).
 */
export function buildAdvancePatch(
  next: OrderStatus,
  nowIso: string,
  paymentStatus?: PaymentStatus,
): {
  status: OrderStatus;
  ready_at?: string;
  completed_at?: string;
  payment_status?: PaymentStatus;
  paid_at?: string;
} {
  if (next === "ready") return { status: next, ready_at: nowIso };
  if (next === "completed") {
    // Handing the order over implies the money has changed hands, so a
    // still-outstanding payment is auto-confirmed — 'completed' never leaves a
    // dangling claim, and confirmed-revenue stays trustworthy.
    if (paymentStatus === "pending" || paymentStatus === "claimed")
      return {
        status: next,
        completed_at: nowIso,
        payment_status: "confirmed",
        paid_at: nowIso,
      };
    return { status: next, completed_at: nowIso };
  }
  return { status: next };
}

/**
 * Sort active orders for the vendor board: in-progress (preparing) before
 * ready, then FIFO within a status by created_at (oldest first). created_at is
 * used rather than order_number because order numbers are per-booth and not
 * globally ordered. Pure + non-mutating.
 */
export function sortActiveOrders(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => {
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rank !== 0) return rank;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}
