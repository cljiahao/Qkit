import type { BoardOrder, OrderStatus, PaymentStatus } from "@/lib/types";

// Explicit column list for every vendor-board order read (initial load +
// realtime resync) — omits access_token, the customer's own status-page
// secret, which the board never needs (least privilege). Single source so
// the two read sites can't drift out of sync with each other.
export const BOARD_ORDER_COLUMNS =
  "id, booth_id, order_number, customer_name, items, status, total_cents, payment_status, payment_method_kind, paid_at, created_at, ready_at, completed_at, updated_at, idempotency_key, priority_bumped_at, source" as const;

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
      // cancelled — no progress
      return -1;
  }
}

export type AgeTone = "fresh" | "aging" | "overdue";

/**
 * Ticket-aging tone for the live board. Defaults (5 min aging, 10 min overdue)
 * match the stock board_settings default; a vendor can set both independently
 * from /dashboard/settings. Pair the tone with the elapsed text + an icon in
 * the UI — never rely on color alone (WCAG 1.4.1). Pure.
 */
export function orderAgeTone(
  elapsedMs: number,
  agingMin = 5,
  overdueMin = 10,
): AgeTone {
  const min = elapsedMs / 60_000;
  if (min < agingMin) return "fresh";
  if (min < overdueMin) return "aging";
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

export type AgeSortOrder = "earliest" | "latest";

/**
 * Sort active orders for the vendor board display: a manually bumped order
 * (vendor's explicit "help this one now" override — most-recently-bumped
 * first) always leads, then every order by created_at — oldest first
 * ("earliest", the default) or newest first ("latest"). created_at is used
 * rather than order_number because order numbers are per-booth and not
 * globally ordered, and is never touched by a bump — ticket-aging display
 * stays accurate regardless of bump state.
 *
 * Deliberately status-agnostic: an old "ready" order sitting unclaimed is
 * exactly the kind of "been waiting longest" case a vendor wants surfaced
 * during a rush, so it can't be pinned below every "preparing" order just
 * because of its status. (The kitchen's own build-priority — what to cook
 * next — is a separate concern; see `ordersAheadOf`, which stays
 * status-aware for the customer-facing wait estimate.) Pure + non-mutating.
 */
export function sortActiveOrders(
  orders: BoardOrder[],
  order: AgeSortOrder = "earliest",
): BoardOrder[] {
  const dir = order === "latest" ? -1 : 1;
  return [...orders].sort((a, b) => {
    const aBumped = a.priority_bumped_at != null;
    const bBumped = b.priority_bumped_at != null;
    if (aBumped !== bBumped) return aBumped ? -1 : 1;
    if (aBumped && bBumped) {
      return (
        new Date(b.priority_bumped_at!).getTime() -
        new Date(a.priority_bumped_at!).getTime()
      );
    }
    return (
      dir *
      (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    );
  });
}

/**
 * How many orders rank strictly ahead of `target` in the kitchen's own
 * build queue — status rank (preparing before ready), then bump state, then
 * created_at/bump time. This is the customer-facing wait estimate, a
 * separate concern from the vendor board's display order
 * (`sortActiveOrders`, which is deliberately status-agnostic so a vendor
 * can triage by pure age): what matters here is what the kitchen still has
 * to *do*, not how the board is currently sorted on screen. Excludes
 * `target` itself and excludes exact ties (undefined ordering, safer to
 * under-count by one than over-promise). Pure.
 */
export function ordersAheadOf(
  orders: {
    id: string;
    status: OrderStatus;
    created_at: string;
    priority_bumped_at?: string | null;
  }[],
  target: {
    id: string;
    status: OrderStatus;
    created_at: string;
    priority_bumped_at?: string | null;
  },
): number {
  const targetRank = STATUS_RANK[target.status];
  const targetBumped = target.priority_bumped_at != null;
  const targetTime = new Date(
    target.priority_bumped_at ?? target.created_at,
  ).getTime();
  return orders.filter((o) => {
    if (o.id === target.id) return false;
    const rank = STATUS_RANK[o.status];
    if (rank < targetRank) return true;
    if (rank > targetRank) return false;
    const oBumped = o.priority_bumped_at != null;
    if (oBumped !== targetBumped) return oBumped;
    const oTime = new Date(o.priority_bumped_at ?? o.created_at).getTime();
    // Bumped orders rank most-recently-bumped-first (descending); everyone
    // else stays FIFO (ascending) — matches sortActiveOrders exactly.
    return oBumped ? oTime > targetTime : oTime < targetTime;
  }).length;
}

/**
 * Coarse "ready in ~N min" label for a customer wait estimate — rounds to
 * the nearest minute (never false second-precision) and reads as "any
 * moment" near zero rather than "~0 min". Pure.
 */
export function estimateLabel(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "Any moment now";
  return `~${minutes} min`;
}

/**
 * Range-based "X-Y min" wait estimate rather than a single precise number —
 * research on waiting-line psychology: a point estimate reads as a promise,
 * and an average-based estimate that's sometimes wrong erodes trust more
 * than a range that was upfront about its own uncertainty. ±25% around the
 * point estimate, floored so a small estimate doesn't degenerate to a
 * zero-width band (e.g. "3-3 min"). Pure.
 */
export function estimateRangeLabel(seconds: number): string {
  const point = Math.round(seconds / 60);
  if (point < 1) return "Any moment now";
  const spread = Math.max(1, Math.round(point * 0.25));
  const lo = Math.max(1, point - spread);
  const hi = point + spread;
  return `${lo}-${hi} min`;
}

/**
 * Fallback for when there isn't enough recent order history to trust a
 * time-based estimate (see estimateWaitSeconds's minimum sample size).
 * Waiting-line research says an unexplained/silent wait feels worse than an
 * explained one — showing queue position instead of hiding the estimate
 * line entirely still answers "how much longer, roughly" without false
 * precision. Pure.
 */
export function queuePositionLabel(ordersAhead: number): string {
  if (ordersAhead <= 0) return "You're next in line";
  if (ordersAhead === 1) return "1 order ahead of you";
  return `${ordersAhead} orders ahead of you`;
}
