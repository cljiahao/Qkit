"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { parseOrderRef } from "@/lib/schemas";
import {
  createCheckout,
  claimCheckout,
  unclaimCheckout,
} from "@/lib/paykit/client";
import type { ActionResult } from "@/lib/action-result";
import type { PaymentStatus } from "@/lib/types";

/**
 * Read one order's payment status. Polling companion to getOrderStatus so the
 * customer's status page reflects the vendor's "Confirm payment" the same way
 * it reflects order progress (realtime is unreliable on customer devices).
 * Service client bypasses RLS — only the single field leaks.
 *
 * Reads qkit's local `orders.payment_status` mirror rather than paykit
 * directly — paykit is the source of truth for whether a claim/confirm
 * *succeeded* (see claimPayment below and dashboard/order-actions.ts's
 * confirmOrderPayment), but this mirror is kept in sync on every successful
 * write, so a poll every few seconds can stay a cheap local read instead of
 * round-tripping paykit's HTTP API each tick.
 */
export async function getPaymentStatus(
  boothId: string,
  orderNumber: string,
  token: string,
): Promise<PaymentStatus | null> {
  if (!parseOrderRef(boothId, orderNumber, token).ok) return null;

  const supabase = await createServiceClient();
  // maybeSingle + log real errors only (an unknown order is a normal null). The
  // token match authorizes the read (booth_id + number aren't secret).
  const { data, error } = await supabase
    .from("orders")
    .select("payment_status")
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .maybeSingle();
  if (error) console.error("getPaymentStatus failed", error.message);

  return data?.payment_status ?? null;
}

/**
 * Look up what paykit needs to create/re-fetch this order's checkout: the
 * order's amount + id (used as paykit's idempotency key, `order_ref`) and the
 * booth's owning vendor. Two small reads instead of a join — mirrors the
 * existing Promise.all pattern in page.tsx rather than depending on a
 * configured Supabase foreign-table relationship.
 */
async function loadCheckoutContext(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  boothId: string,
  orderNumber: string,
  token: string,
) {
  const [{ data: order }, { data: booth }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, total_cents, payment_status, status")
      .eq("booth_id", boothId)
      .eq("order_number", orderNumber)
      .eq("access_token", token)
      .maybeSingle(),
    supabase.from("booths").select("vendor_id").eq("id", boothId).maybeSingle(),
  ]);
  if (!order || !booth?.vendor_id) return null;
  return {
    orderId: order.id as string,
    totalCents: order.total_cents as number,
    vendorId: booth.vendor_id as string,
    paymentStatus: order.payment_status as PaymentStatus,
    status: order.status as string,
  };
}

// Customer is anonymous, so this uses the service-role client (same pattern as
// the order status page read). It is deliberately narrow: it only advances a
// single order from 'pending' to 'claimed'. It cannot set 'confirmed' (vendor-
// only) and cannot touch order_status. Payment is trust-based: a claim is
// only a hint — the vendor confirms real receipt on the board.
//
// paykit is the source of truth for the claim itself (its own
// pending→claimed transition, see paykit/src/lib/tx-state.ts); the order's
// order.id is passed as paykit's `order_ref` so repeated taps against the
// same order always resolve to the same paykit transaction
// (idempotent on (kit_slug, order_ref)). `orders.payment_status` is updated
// afterward purely as a local mirror for the rest of qkit's order-lifecycle
// logic (board realtime, cancel-blocking, auto-confirm-on-complete) — a
// failure writing that mirror does not undo an already-successful paykit
// claim, so it still reports success to the customer.
export async function claimPayment(
  boothId: string,
  orderNumber: string,
  token: string,
): Promise<ActionResult> {
  const parsed = parseOrderRef(boothId, orderNumber, token);
  if (!parsed.ok)
    return {
      success: false,
      error: parsed.field === "booth" ? "Invalid booth" : "Invalid order",
    };

  const supabase = await createServiceClient();

  // Throttle per IP+booth so a script can't enumerate the small sequential
  // order numbers and mass-flip a booth's orders to 'claimed'. Fails open on
  // limiter errors (don't block a real customer on infra hiccups).
  const ip = clientIp(await headers());
  const allowed = await rateLimit(supabase, `claim:${boothId}:${ip}`, 10, 60);
  if (!allowed)
    return { success: false, error: "Too many attempts — wait a moment." };

  const ctx = await loadCheckoutContext(supabase, boothId, orderNumber, token);
  if (!ctx) return { success: false, error: "Invalid order" };
  if (ctx.status === "cancelled")
    return { success: false, error: "This order was cancelled." };
  // Already claimed/confirmed (double-tap, or the vendor already confirmed
  // receipt) — idempotent success, no need to call paykit again.
  if (ctx.paymentStatus === "claimed" || ctx.paymentStatus === "confirmed")
    return { success: true };
  if (ctx.paymentStatus === "not_required")
    return { success: false, error: "This order doesn't take payment." };

  const checkout = await createCheckout({
    vendorId: ctx.vendorId,
    amountCents: ctx.totalCents,
    orderRef: ctx.orderId,
  });
  if (!checkout.ok) {
    console.error("claimPayment: paykit checkout failed", checkout.error);
    return { success: false, error: "Could not record payment. Try again." };
  }

  const claim = await claimCheckout(checkout.data.transactionId);
  if (!claim.ok) {
    console.error("claimPayment: paykit claim failed", claim.error);
    return { success: false, error: "Could not record payment. Try again." };
  }

  const { error } = await supabase
    .from("orders")
    .update({ payment_status: "claimed" })
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .eq("payment_status", "pending")
    .neq("status", "cancelled")
    .select("id");
  if (error)
    console.error("claimPayment: local mirror update failed", error.message);

  // paykit already recorded the claim by this point — a mirror-write failure
  // (or losing a race to a concurrent claim from another tab) doesn't change
  // that outcome.
  return { success: true };
}

// Undo an accidental "I've paid" tap: revert a still-unverified 'claimed'
// order back to 'pending'. Mirror of claimPayment, same idempotency shape.
//
// There's no stored paykit transaction id for an order — `createCheckout` is
// idempotent on (kit_slug, order_ref=order.id), so re-calling it here just
// re-fetches the transaction claimPayment already created earlier, the same
// lookup mechanism confirmOrderPayment (dashboard/order-actions.ts) uses to
// reach the same transaction from the vendor side. `unclaimCheckout` is
// paykit's own authority on whether a revert is still allowed — it refuses
// to revert a 'confirmed' transaction and just echoes that status back, so
// the pre-check below (against the local mirror) is a fast path, not the
// only guard against un-confirming real money.
export async function unclaimPayment(
  boothId: string,
  orderNumber: string,
  token: string,
): Promise<ActionResult> {
  const parsed = parseOrderRef(boothId, orderNumber, token);
  if (!parsed.ok)
    return {
      success: false,
      error: parsed.field === "booth" ? "Invalid booth" : "Invalid order",
    };

  const supabase = await createServiceClient();

  const ip = clientIp(await headers());
  const allowed = await rateLimit(supabase, `unclaim:${boothId}:${ip}`, 10, 60);
  if (!allowed)
    return { success: false, error: "Too many attempts — wait a moment." };

  const ctx = await loadCheckoutContext(supabase, boothId, orderNumber, token);
  if (!ctx) return { success: false, error: "Invalid order" };
  if (ctx.paymentStatus === "pending") return { success: true };
  if (ctx.paymentStatus === "confirmed")
    return {
      success: false,
      error: "The stall already confirmed your payment.",
    };
  if (ctx.paymentStatus === "not_required")
    return { success: false, error: "This order doesn't take payment." };

  const checkout = await createCheckout({
    vendorId: ctx.vendorId,
    amountCents: ctx.totalCents,
    orderRef: ctx.orderId,
  });
  if (!checkout.ok) {
    console.error(
      "unclaimPayment: paykit checkout lookup failed",
      checkout.error,
    );
    return { success: false, error: "Could not undo. Try again." };
  }

  const unclaim = await unclaimCheckout(checkout.data.transactionId);
  if (!unclaim.ok) {
    console.error("unclaimPayment: paykit unclaim failed", unclaim.error);
    return { success: false, error: "Could not undo. Try again." };
  }
  if (unclaim.data.status === "confirmed")
    return {
      success: false,
      error: "The stall already confirmed your payment.",
    };

  const { error } = await supabase
    .from("orders")
    .update({ payment_status: "pending" })
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .eq("payment_status", "claimed")
    .neq("status", "cancelled")
    .select("id");
  if (error)
    console.error("unclaimPayment: local mirror update failed", error.message);

  return { success: true };
}
