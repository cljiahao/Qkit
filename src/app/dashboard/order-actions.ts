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
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, payment_status")
    .eq("id", orderId)
    .maybeSingle();
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

  const { error } = await supabase
    .from("orders")
    .update(
      buildAdvancePatch(
        adv.next,
        new Date().toISOString(),
        order.payment_status,
      ),
    )
    .eq("id", orderId);
  if (error) {
    console.error("advanceOrder failed", error.message);
    return { success: false, error: "Failed to update order" };
  }

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

  const { error } = await supabase
    .from("orders")
    .update({ payment_status: "confirmed", paid_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) {
    console.error("confirmOrderPayment failed", error.message);
    return { success: false, error: "Failed to confirm payment" };
  }

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

  const { error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId);
  if (error) {
    console.error("cancelOrder failed", error.message);
    return { success: false, error: "Failed to cancel order" };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
