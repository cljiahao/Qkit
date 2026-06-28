"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

const boothIdSchema = z.string().uuid();
// Order numbers are short sequential per-booth strings — validate to reject
// junk and bound the value used in the query.
const orderNumberSchema = z.string().min(1).max(40);

// Customer is anonymous, so this uses the service-role client (same pattern as
// the order status page read). It is deliberately narrow: it only advances a
// single order from 'pending' to 'claimed'. It cannot set 'confirmed' (vendor-
// only) and cannot touch order_status. The .eq("payment_status","pending")
// guard makes a double-tap or a replay a no-op. Payment is trust-based: a claim
// is only a hint — the vendor confirms real receipt on the board.
export async function claimPayment(
  boothId: string,
  orderNumber: string,
): Promise<ActionResult> {
  if (!boothIdSchema.safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };
  if (!orderNumberSchema.safeParse(orderNumber).success)
    return { success: false, error: "Invalid order" };

  const supabase = await createServiceClient();

  // Throttle per IP+booth so a script can't enumerate the small sequential
  // order numbers and mass-flip a booth's orders to 'claimed'. Fails open on
  // limiter errors (don't block a real customer on infra hiccups).
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown";
  const { data: allowed } = await supabase.rpc("check_rate_limit", {
    p_key: `claim:${boothId}:${ip}`,
    p_limit: 10,
    p_window_seconds: 60,
  });
  if (allowed === false)
    return { success: false, error: "Too many attempts — wait a moment." };

  const { error } = await supabase
    .from("orders")
    .update({ payment_status: "claimed" })
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("payment_status", "pending");

  if (error) {
    console.error("claimPayment failed", error.message);
    return { success: false, error: "Could not record payment. Try again." };
  }
  return { success: true };
}
