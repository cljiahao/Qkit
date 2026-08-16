"use server";

import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/get-user";
import { boardSettingsSchema } from "@/lib/schemas";
import { ADVANCE, buildAdvancePatch, isTerminal } from "@/lib/orders";
import { createCheckout, confirmCheckout } from "@/lib/paykit/client";
import { notifyCustomer } from "@/lib/merqo-customer-notify";
import type { ActionResult } from "@/lib/action-result";
import type { OrderStatus, PaymentStatus } from "@/lib/types";

// Vendor order-board mutations behind a validated server boundary. Authorization
// is enforced in Postgres: getUser() gates signed-in, and RLS
// (orders_vendor_update USING + WITH CHECK) scopes writes to the vendor's own
// booths — the server client runs as the AUTHENTICATED role, never service-role.
// The 0032 freeze trigger blocks any attempt to change financial/identity
// columns, so these actions only ever touch the state-machine columns.

const idSchema = z.string().uuid();

type StatusResult = ActionResult<{ status: OrderStatus }>;

/** Load the current order (RLS-scoped to the caller's booths) for a gated vendor. */
async function loadOwnOrder(orderId: string) {
  const user = await getUser();
  if (!user) return { supabase: null, order: null, userId: null } as const;

  const supabase = await createServerClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, status, payment_status, auto_completed, total_cents")
    .eq("id", orderId)
    .maybeSingle();
  // A read error (not a missing row) is otherwise indistinguishable from
  // "not found" to the caller — log it so a DB hiccup is debuggable.
  if (error) console.error("loadOwnOrder failed", error.message);
  return { supabase, order, userId: user.id } as const;
}

/**
 * Advance an order to its next state (preparing→ready→completed), stamping the
 * transition timestamp. The next state is derived server-side from the order's
 * current status — the client never dictates it. Rejects an order with no legal
 * forward move (e.g. already terminal).
 */
export async function advanceOrder(orderId: string): Promise<StatusResult> {
  if (!idSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };

  const { supabase, order, userId } = await loadOwnOrder(orderId);
  if (!supabase || !order) return { success: false, error: "Order not found" };

  const adv = ADVANCE[order.status];
  if (!adv) return { success: false, error: "Order can't be advanced" };

  // Guard on the status we read: if a concurrent action (e.g. a cancel) moved
  // the order meanwhile, the UPDATE matches 0 rows instead of blindly advancing
  // by id — which could otherwise resurrect a cancelled order into revenue+stock.
  const { data: rows, error } = await supabase
    .from("orders")
    .update(
      buildAdvancePatch(
        adv.next,
        new Date().toISOString(),
        order.payment_status,
      ),
    )
    .eq("id", orderId)
    .eq("status", order.status)
    .select("id");
  if (error) {
    console.error("advanceOrder failed", error.message);
    return { success: false, error: "Failed to update order" };
  }
  if (!rows || rows.length === 0)
    return { success: false, error: "Order changed — please refresh." };

  // Same fire-and-forget pattern as notifyVendorTelegram in
  // src/app/o/[code]/actions.ts: notifyCustomer already never throws on its
  // own, but this call site still wraps it so nothing here can ever change
  // advanceOrder's own returned result below.
  if (adv.next === "ready" && userId) {
    try {
      await notifyCustomer(
        userId,
        `qkit:${orderId}`,
        "Your order is ready for pickup!",
      );
    } catch (err) {
      console.error("advanceOrder: notifyCustomer failed", err);
    }
  }

  return { success: true, status: adv.next };
}

/**
 * Undo a just-made advanceOrder call within its short undo window (see
 * order-card.tsx). `revertFrom` must be the legal ADVANCE target of
 * `revertTo` — the client can't use this to jump an order to an arbitrary
 * status, only to walk back the single transition it just made.
 * `prevPaymentStatus` is what payment_status was BEFORE that transition
 * (the client already has it — it read the order before calling
 * advanceOrder): undoing a completion also undoes the auto-confirm
 * buildAdvancePatch applied, exactly mirroring what advanceOrder did.
 */
export async function revertOrderAdvance(
  orderId: string,
  revertTo: OrderStatus,
  revertFrom: OrderStatus,
  prevPaymentStatus: PaymentStatus,
): Promise<StatusResult> {
  if (!idSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };
  if (ADVANCE[revertTo]?.next !== revertFrom)
    return { success: false, error: "Not a valid undo" };

  const { supabase, order } = await loadOwnOrder(orderId);
  if (!supabase || !order) return { success: false, error: "Order not found" };

  const patch: {
    status: OrderStatus;
    ready_at?: null;
    completed_at?: null;
    payment_status?: PaymentStatus;
    paid_at?: null;
  } = { status: revertTo };
  if (revertFrom === "ready") patch.ready_at = null;
  if (revertFrom === "completed") {
    patch.completed_at = null;
    // Mirrors buildAdvancePatch's own auto-confirm condition — only undo the
    // payment flip if advanceOrder is what caused it.
    if (prevPaymentStatus === "pending" || prevPaymentStatus === "claimed") {
      patch.payment_status = prevPaymentStatus;
      patch.paid_at = null;
    }
  }

  // Guard on the status we read: if something else moved the order during
  // the undo window (e.g. another device advanced it further), this becomes
  // a no-op refresh prompt instead of clobbering that concurrent change.
  const { data: rows, error } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .eq("status", revertFrom)
    .select("id");
  if (error) {
    console.error("revertOrderAdvance failed", error.message);
    return { success: false, error: "Failed to undo" };
  }
  if (!rows || rows.length === 0)
    return { success: false, error: "Order changed — please refresh." };

  return { success: true, status: revertTo };
}

/**
 * Restore an order the auto-clear sweep completed prematurely back to
 * 'ready'. Deliberately narrower than revertOrderAdvance — this is a fresh
 * page load with no client-held prior state (the completed-orders history
 * page, not the live board's short undo window) — and only ever applies to
 * a sweep-driven completion (auto_completed=true), never a vendor's own
 * manual "Mark Picked Up" tap. Restamps ready_at to now — without this, the
 * restored order still carries its original (pre-sweep) ready_at and the
 * very next sweepReadyOrders poll would immediately re-complete it, making
 * the restore a no-op in practice.
 */
export async function restoreAutoCompleted(
  orderId: string,
): Promise<StatusResult> {
  if (!idSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };

  const { supabase, order } = await loadOwnOrder(orderId);
  if (!supabase || !order) return { success: false, error: "Order not found" };
  if (order.status !== "completed" || !order.auto_completed)
    return { success: false, error: "This order can't be restored" };

  const { data: rows, error } = await supabase
    .from("orders")
    .update({
      status: "ready",
      ready_at: new Date().toISOString(),
      completed_at: null,
      auto_completed: false,
    })
    .eq("id", orderId)
    .eq("status", "completed")
    .select("id");
  if (error) {
    console.error("restoreAutoCompleted failed", error.message);
    return { success: false, error: "Failed to restore order" };
  }
  if (!rows || rows.length === 0)
    return { success: false, error: "Order changed — please refresh." };

  return { success: true, status: "ready" };
}

/**
 * Mark a claimed/pending order as paid. Idempotent if already confirmed;
 * rejects orders that never needed payment.
 *
 * paykit is now the source of truth for the confirm transition itself — the
 * vendor IS the `vendor_id` paykit's config/checkout are keyed on (this
 * action only ever runs for the authenticated vendor's own orders, enforced
 * by RLS via loadOwnOrder), so no extra booth lookup is needed. `orderId` is
 * reused as paykit's `order_ref`, matching the checkout paykit already
 * created for this order on the customer's status page (idempotent — this
 * re-fetches the same transaction rather than creating a second one).
 * `orders.payment_status` is then updated as a local mirror, same rationale
 * as claimPayment (payment-actions.ts): the rest of qkit's order-lifecycle
 * logic (cancel-blocking, auto-confirm-on-complete, board realtime) still
 * reads it directly.
 */
export async function confirmOrderPayment(
  orderId: string,
): Promise<ActionResult> {
  if (!idSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };

  const { supabase, order, userId } = await loadOwnOrder(orderId);
  if (!supabase || !order || !userId)
    return { success: false, error: "Order not found" };

  if (order.payment_status === "confirmed") return { success: true };
  if (order.payment_status === "not_required")
    return { success: false, error: "This order doesn't take payment" };
  if (order.status === "cancelled")
    return { success: false, error: "This order was cancelled" };

  const checkout = await createCheckout({
    vendorId: userId,
    amountCents: order.total_cents,
    orderRef: order.id,
  });
  if (!checkout.ok) {
    console.error(
      "confirmOrderPayment: paykit checkout failed",
      checkout.error,
    );
    return { success: false, error: "Failed to confirm payment" };
  }
  const confirm = await confirmCheckout(checkout.data.transactionId);
  if (!confirm.ok) {
    console.error("confirmOrderPayment: paykit confirm failed", confirm.error);
    return { success: false, error: "Failed to confirm payment" };
  }

  // Guard on the payment_status we read so a concurrent flip (double-tap, or a
  // cancel) makes this a no-op rather than a lost update. paykit already
  // recorded the confirm by this point, so a lost race here (0 rows) doesn't
  // change the outcome the customer sees via the paykit-backed source of truth.
  const { error } = await supabase
    .from("orders")
    .update({ payment_status: "confirmed", paid_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("payment_status", order.payment_status)
    .select("id");
  if (error)
    console.error(
      "confirmOrderPayment: local mirror update failed",
      error.message,
    );

  return { success: true };
}

/**
 * Manually bump a live order to the front of its status lane — an explicit,
 * one-time vendor override (e.g. an elderly/non-digital customer at the
 * counter), not a permanent pin. Rejects a terminal order; no limit on how
 * often a live order can be re-bumped (deliberate — see
 * docs/superpowers/specs/2026-07-18-manual-queue-priority-override-design.md).
 */
export async function bumpOrder(orderId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };

  const { supabase, order } = await loadOwnOrder(orderId);
  if (!supabase || !order) return { success: false, error: "Order not found" };
  if (isTerminal(order.status))
    return { success: false, error: "Order is already closed" };

  // Guard on the status we read, same concurrency pattern as advance/cancel —
  // a status change between the read and this write means someone else acted
  // on the order first, so this bump becomes a no-op refresh prompt rather
  // than silently bumping a now-stale view of the order.
  const { data: rows, error } = await supabase
    .from("orders")
    .update({ priority_bumped_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", order.status)
    .select("id");
  if (error) {
    console.error("bumpOrder failed", error.message);
    return { success: false, error: "Failed to bump order" };
  }
  if (!rows || rows.length === 0)
    return { success: false, error: "Order changed — please refresh." };

  return { success: true };
}

/**
 * Cancel a live order. Rejects an order that's already completed/cancelled --
 * except an auto-completed one (sweepReadyOrders beat the vendor to it, not a
 * deliberate "Mark Picked Up" tap): that's still cancellable, same philosophy
 * as restoreAutoCompleted treating the sweep's own completion as reversible.
 * Clears auto_completed/completed_at on that path so a cancelled order never
 * carries stale "this was completed" bookkeeping.
 */
export async function cancelOrder(orderId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };

  const { supabase, order } = await loadOwnOrder(orderId);
  if (!supabase || !order) return { success: false, error: "Order not found" };
  const autoCompletedRace =
    order.status === "completed" && order.auto_completed;
  if (isTerminal(order.status) && !autoCompletedRace)
    return { success: false, error: "Order is already closed" };
  // No refund rail: cancelling a confirmed-payment order would take money with
  // no order behind it. A "claimed" order (customer says paid, unconfirmed)
  // stays cancellable — the money isn't real to us until the vendor confirms.
  if (order.payment_status === "confirmed")
    return {
      success: false,
      error: "Paid orders can't be cancelled. Refund the customer directly.",
    };

  // Guard on the status we read so a cancel can't race an advance to completed
  // (which would otherwise be undone, or leave stock/revenue inconsistent) --
  // an auto-completed order is the one deliberate exception (see above).
  const { data: rows, error } = await supabase
    .from("orders")
    .update(
      autoCompletedRace
        ? { status: "cancelled", auto_completed: false, completed_at: null }
        : { status: "cancelled" },
    )
    .eq("id", orderId)
    .eq("status", order.status)
    .select("id");
  if (error) {
    console.error("cancelOrder failed", error.message);
    return { success: false, error: "Failed to cancel order" };
  }
  if (!rows || rows.length === 0)
    return { success: false, error: "Order changed — please refresh." };

  return { success: true };
}

/**
 * Auto-clear sweep: flips every 'ready' order older than the vendor's
 * configured ready_auto_clear_min (board_settings) to 'completed'. No id
 * param — bulk, RLS-scoped to the caller's own booths (orders_vendor_update)
 * exactly like every other mutation here. Called on a client poll (see
 * realtime-order-board.tsx) rather than a DB cron job, matching this
 * codebase's existing usePolling pattern. Returns void: this is a background
 * sweep the caller doesn't surface a toast for — a real failure is logged,
 * and the next poll simply retries.
 */
export async function sweepReadyOrders(): Promise<void> {
  const user = await getUser();
  if (!user) return;

  const supabase = await createServerClient();
  const { data: vendor } = await supabase
    .from("vendors")
    .select("board_settings")
    .eq("id", user.id)
    .maybeSingle();
  const settings = boardSettingsSchema.safeParse(vendor?.board_settings);
  const minutes = settings.success ? settings.data.ready_auto_clear_min : null;
  if (minutes === null) return;

  const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
  const { error } = await supabase
    .from("orders")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      auto_completed: true,
    })
    .eq("status", "ready")
    .lt("ready_at", cutoff);
  if (error) console.error("sweepReadyOrders failed", error.message);
}
