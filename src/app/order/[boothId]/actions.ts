"use server";

import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import {
  placeOrderSchema,
  parseBoothHours,
  type PlaceOrderInput,
} from "@/lib/schemas";
import { isBoothOpen } from "@/lib/hours";
import { genOrderNumber } from "@/lib/utils";

type PlaceOrderResult =
  | { success: true; orderNumber: string }
  | { success: false; error: string };

const boothIdSchema = z.string().uuid();

export async function placeOrder(
  boothId: string,
  input: PlaceOrderInput,
  attempt = 0,
): Promise<PlaceOrderResult> {
  // Server-side validation — the client form only validates customerName,
  // so items arrive here untrusted. Never trust client validation.
  if (!boothIdSchema.safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };

  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: "Invalid order details" };
  const order = parsed.data;

  if (attempt > 5)
    return {
      success: false,
      error: "Could not generate a unique order number",
    };

  const supabase = await createServerClient();

  // Re-check the booth is open server-side — never trust the client's state.
  const { data: booth } = await supabase
    .from("booths")
    .select("is_active, hours")
    .eq("id", boothId)
    .single();
  if (!booth) return { success: false, error: "Booth not found" };
  const nowIso = new Date().toISOString();
  if (
    !isBoothOpen(
      { is_active: booth.is_active, hours: parseBoothHours(booth.hours) },
      nowIso,
    )
  )
    return { success: false, error: "This booth is closed" };

  const { count, error: countError } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("booth_id", boothId);

  if (countError)
    return { success: false, error: "Failed to generate order number" };

  const orderNumber = genOrderNumber((count ?? 0) + attempt);
  const totalCents = order.items.reduce(
    (sum, item) => sum + (item.price_cents ?? 0) * item.quantity,
    0,
  );

  const { error } = await supabase.from("orders").insert({
    booth_id: boothId,
    order_number: orderNumber,
    customer_name: order.customerName,
    items: order.items,
    total_cents: totalCents,
    // Orders land as "preparing" — no separate ack step; the booth starts
    // making it the moment it arrives.
    status: "preparing",
  });

  if (error) {
    if (error.code === "23505") {
      return placeOrder(boothId, input, attempt + 1);
    }
    return { success: false, error: error.message };
  }

  return { success: true, orderNumber };
}
