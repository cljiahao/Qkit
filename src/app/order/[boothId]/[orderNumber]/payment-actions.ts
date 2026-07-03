"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  orderBoothIdSchema,
  orderNumberSchema,
  orderTokenSchema,
} from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-result";
import type { PaymentStatus } from "@/lib/types";

/**
 * Read one order's payment status. Polling companion to getOrderStatus so the
 * customer's status page reflects the vendor's "Confirm payment" the same way
 * it reflects order progress (realtime is unreliable on customer devices).
 * Service client bypasses RLS — only the single field leaks.
 */
export async function getPaymentStatus(
  boothId: string,
  orderNumber: string,
  token: string,
): Promise<PaymentStatus | null> {
  if (
    !orderBoothIdSchema.safeParse(boothId).success ||
    !orderNumberSchema.safeParse(orderNumber).success ||
    !orderTokenSchema.safeParse(token).success
  )
    return null;

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

// Customer is anonymous, so this uses the service-role client (same pattern as
// the order status page read). It is deliberately narrow: it only advances a
// single order from 'pending' to 'claimed'. It cannot set 'confirmed' (vendor-
// only) and cannot touch order_status. The .eq("payment_status","pending")
// guard makes a double-tap or a replay a no-op. Payment is trust-based: a claim
// is only a hint — the vendor confirms real receipt on the board.
export async function claimPayment(
  boothId: string,
  orderNumber: string,
  token: string,
): Promise<ActionResult> {
  if (!orderBoothIdSchema.safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };
  if (!orderNumberSchema.safeParse(orderNumber).success)
    return { success: false, error: "Invalid order" };
  if (!orderTokenSchema.safeParse(token).success)
    return { success: false, error: "Invalid order" };

  const supabase = await createServiceClient();

  // Throttle per IP+booth so a script can't enumerate the small sequential
  // order numbers and mass-flip a booth's orders to 'claimed'. Fails open on
  // limiter errors (don't block a real customer on infra hiccups).
  const ip = clientIp(await headers());
  const allowed = await rateLimit(supabase, `claim:${boothId}:${ip}`, 10, 60);
  if (!allowed)
    return { success: false, error: "Too many attempts — wait a moment." };

  const { data: rows, error } = await supabase
    .from("orders")
    .update({ payment_status: "claimed" })
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .eq("payment_status", "pending")
    // A cancelled order must not accept a payment claim — no-op it.
    .neq("status", "cancelled")
    .select("id");

  if (error) {
    console.error("claimPayment failed", error.message);
    return { success: false, error: "Could not record payment. Try again." };
  }
  if (rows && rows.length > 0) return { success: true };

  // The guarded UPDATE matched nothing. Re-read to distinguish a harmless
  // double-tap (already claimed/confirmed → keep it idempotent) from a genuine
  // "can't pay this" (cancelled, or a wrong token/order) — so a cancelled order
  // no longer falsely reports "payment sent".
  const { data: cur } = await supabase
    .from("orders")
    .select("payment_status, status")
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .maybeSingle();
  if (!cur) return { success: false, error: "Invalid order" };
  if (cur.payment_status === "claimed" || cur.payment_status === "confirmed")
    return { success: true };
  if (cur.status === "cancelled")
    return { success: false, error: "This order was cancelled." };
  return { success: false, error: "Order changed — please refresh." };
}
