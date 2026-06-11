import type { Order, OrderStatus } from "@/lib/types";

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
