import type { Order, OrderStatus } from "@/lib/types";

// A finished order — off the active board, no further transitions. Single
// source of truth for the "is this done" check that several views need.
export const TERMINAL_STATUSES: OrderStatus[] = ["completed", "cancelled"];

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

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
