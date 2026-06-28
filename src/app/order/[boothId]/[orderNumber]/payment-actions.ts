"use server";

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

const boothIdSchema = z.string().uuid();

// Customer is anonymous, so this uses the service-role client (same pattern as
// the order status page read). It is deliberately narrow: it only advances a
// single order from 'pending' to 'claimed'. It cannot set 'confirmed' (vendor-
// only) and cannot touch order_status. The .eq("payment_status","pending")
// guard makes a double-tap or a replay a no-op.
export async function claimPayment(
  boothId: string,
  orderNumber: string,
): Promise<ActionResult> {
  if (!boothIdSchema.safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };

  const supabase = await createServiceClient();
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
