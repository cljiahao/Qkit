"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { parseOrderRef, parsePreClaimRef } from "@/lib/schemas";
import {
  createCheckout,
  claimCheckout,
  unclaimCheckout,
  type CheckoutView,
} from "@/lib/paykit/client";
import { resizeToWebp } from "@/lib/image-resize";
import { hashBuffer } from "@/lib/hash";
import { notifyVendorTelegram, notifyPrintkit } from "@/app/o/[code]/actions";
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

/**
 * Read what the pre-claim pay panel needs for a payment-required order that
 * has no order_number yet (numbering is deferred to a successful claim — see
 * claimPayment below). Same two-read + createCheckout shape as page.tsx's own
 * loadCheckoutView, just keyed on (boothId, token) instead of a numbered
 * order route.
 */
export async function loadPreClaimContext(
  boothId: string,
  token: string,
): Promise<{
  orderId: string;
  amountCents: number;
  checkout: CheckoutView | null;
} | null> {
  const parsed = parsePreClaimRef(boothId, token);
  if (!parsed.ok) return null;

  const supabase = await createServiceClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, total_cents, payment_status")
    .eq("booth_id", boothId)
    .eq("access_token", token)
    .maybeSingle();
  if (!order || order.payment_status !== "pending") return null;

  const { data: booth } = await supabase
    .from("booths")
    .select("vendor_id")
    .eq("id", boothId)
    .maybeSingle();
  if (!booth?.vendor_id) return null;

  const checkout = await createCheckout({
    vendorId: booth.vendor_id,
    amountCents: order.total_cents,
    orderRef: order.id,
  });

  return {
    orderId: order.id,
    amountCents: order.total_cents,
    checkout: checkout.ok ? checkout.data : null,
  };
}

// Customer is anonymous, so this uses the service-role client (same pattern as
// the order status page read). Requires an uploaded payment screenshot — the
// photo upload IS the claim now, not a follow-on step, and doubles as the
// mechanism that finally assigns this order's number (deferred at place_order
// time for any payment-required order — see migration 0087). Payment is
// trust-based: a claim is only a hint — the vendor confirms real receipt on
// the board.
//
// Order of operations is load-bearing: upload the photo + hash it first,
// THEN call paykit's claim, THEN assign the order number and fire the vendor
// notifications, THEN write the local payment_status mirror last. A failed
// upload never touches payment_status or order_number at all (no
// half-claimed state); a failed paykit claim leaves only a harmless orphaned
// photo in storage; a failed mirror write doesn't undo an already-successful
// paykit claim + already-assigned number, so it still reports success.
export async function claimPayment(
  boothId: string,
  token: string,
  photo: File | null,
): Promise<ActionResult<{ orderNumber: string }>> {
  if (!photo) {
    return { success: false, error: "A payment screenshot is required." };
  }

  const parsed = parsePreClaimRef(boothId, token);
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

  const { data: order } = await supabase
    .from("orders")
    .select("id, total_cents, payment_status, status, customer_name")
    .eq("booth_id", boothId)
    .eq("access_token", token)
    .maybeSingle();
  if (!order) return { success: false, error: "Invalid order" };
  if (order.status === "cancelled")
    return { success: false, error: "This order was cancelled." };
  if (order.payment_status !== "pending")
    return { success: false, error: "This order isn't awaiting payment." };

  const { data: booth } = await supabase
    .from("booths")
    .select("vendor_id, print_enabled")
    .eq("id", boothId)
    .maybeSingle();
  if (!booth?.vendor_id) return { success: false, error: "Invalid order" };

  const resized = await resizeToWebp(photo, 1600);
  const buffer = await resized.blob.arrayBuffer();
  const hash = await hashBuffer(buffer);
  const path = `${booth.vendor_id}/${order.id}.${resized.ext}`;

  const { error: uploadError } = await supabase.storage
    .from("payment-proofs")
    .upload(path, buffer, { upsert: true, contentType: resized.type });
  if (uploadError) {
    console.error("claimPayment: proof upload failed", uploadError.message);
    return { success: false, error: "Could not upload photo. Try again." };
  }

  const checkout = await createCheckout({
    vendorId: booth.vendor_id,
    amountCents: order.total_cents,
    orderRef: order.id,
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

  const { data: orderNumber, error: assignError } = await supabase.rpc(
    "assign_order_number",
    { p_order_id: order.id },
  );
  if (assignError || !orderNumber) {
    console.error(
      "claimPayment: assign_order_number failed",
      assignError?.message,
    );
    return { success: false, error: "Could not finalize order. Try again." };
  }

  await Promise.all([
    notifyVendorTelegram(boothId, orderNumber),
    notifyPrintkit(boothId, orderNumber, order.customer_name),
  ]);

  const { error: mirrorError } = await supabase
    .from("orders")
    .update({
      payment_status: "claimed",
      payment_proof_path: path,
      payment_proof_hash: hash,
    })
    .eq("id", order.id)
    .eq("payment_status", "pending");
  if (mirrorError)
    console.error(
      "claimPayment: local mirror update failed",
      mirrorError.message,
    );

  return { success: true, orderNumber };
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
