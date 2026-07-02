"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { getVendor } from "@/lib/supabase/get-vendor";
import { ADVANCE, buildAdvancePatch, isTerminal } from "@/lib/orders";
import type { ActionResult } from "@/lib/action-result";
import type { OrderStatus } from "@/lib/types";

// Vendor order-board mutations. The browser used to UPDATE orders directly;
// these move that behind a validated server boundary (Layer 1). Authorization
// is still enforced in Postgres: getVendor() gates signed-in, and RLS
// (orders_vendor_update USING + WITH CHECK) scopes writes to the vendor's own
// booths — the server client runs as the AUTHENTICATED role, never service-role.
// The 0032 freeze trigger blocks any attempt to change financial/identity
// columns, so these actions only ever touch the state-machine columns.

const idSchema = z.string().uuid();

type StatusResult = ActionResult<{ status: OrderStatus }>;

/** Load the current order (RLS-scoped to the caller's booths) for a gated vendor. */
async function loadOwnOrder(orderId: string) {
  const { user } = await getVendor();
  if (!user) return { supabase: null, order: null } as const;

  const supabase = await createServerClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, status, payment_status")
    .eq("id", orderId)
    .maybeSingle();
  // A read error (not a missing row) is otherwise indistinguishable from
  // "not found" to the caller — log it so a DB hiccup is debuggable (N7).
  if (error) console.error("loadOwnOrder failed", error.message);
  return { supabase, order } as const;
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

  const { supabase, order } = await loadOwnOrder(orderId);
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

  revalidatePath("/dashboard");
  return { success: true, status: adv.next };
}

/**
 * Mark a claimed/pending order as paid. Idempotent if already confirmed;
 * rejects orders that never needed payment.
 */
export async function confirmOrderPayment(
  orderId: string,
): Promise<ActionResult> {
  if (!idSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };

  const { supabase, order } = await loadOwnOrder(orderId);
  if (!supabase || !order) return { success: false, error: "Order not found" };

  if (order.payment_status === "confirmed") return { success: true };
  if (order.payment_status === "not_required")
    return { success: false, error: "This order doesn't take payment" };

  // Guard on the payment_status we read so a concurrent flip (double-tap, or a
  // cancel) makes this a no-op rather than a lost update.
  const { data: rows, error } = await supabase
    .from("orders")
    .update({ payment_status: "confirmed", paid_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("payment_status", order.payment_status)
    .select("id");
  if (error) {
    console.error("confirmOrderPayment failed", error.message);
    return { success: false, error: "Failed to confirm payment" };
  }
  if (!rows || rows.length === 0)
    return { success: false, error: "Order changed — please refresh." };

  revalidatePath("/dashboard");
  return { success: true };
}

/** Cancel a live order. Rejects an order that's already completed/cancelled. */
export async function cancelOrder(orderId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };

  const { supabase, order } = await loadOwnOrder(orderId);
  if (!supabase || !order) return { success: false, error: "Order not found" };
  if (isTerminal(order.status))
    return { success: false, error: "Order is already closed" };

  // Guard on the status we read so a cancel can't race an advance to completed
  // (which would otherwise be undone, or leave stock/revenue inconsistent).
  const { data: rows, error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .eq("status", order.status)
    .select("id");
  if (error) {
    console.error("cancelOrder failed", error.message);
    return { success: false, error: "Failed to cancel order" };
  }
  if (!rows || rows.length === 0)
    return { success: false, error: "Order changed — please refresh." };

  revalidatePath("/dashboard");
  return { success: true };
}
