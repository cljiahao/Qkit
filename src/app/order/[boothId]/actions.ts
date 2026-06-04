"use server";

import { createServerClient } from "@/lib/supabase/server";
import type { PlaceOrderInput } from "@/lib/schemas";

type PlaceOrderResult =
  | { success: true; orderNumber: string }
  | { success: false; error: string };

export async function placeOrder(
  boothId: string,
  input: PlaceOrderInput,
  attempt = 0,
): Promise<PlaceOrderResult> {
  if (attempt > 5)
    return {
      success: false,
      error: "Could not generate a unique order number",
    };

  const supabase = await createServerClient();

  const { count, error: countError } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("booth_id", boothId);

  if (countError)
    return { success: false, error: "Failed to generate order number" };

  const orderNumber = String((count ?? 0) + 1 + attempt).padStart(4, "0");
  const totalCents = input.items.reduce(
    (sum, item) => sum + item.price_cents * item.quantity,
    0,
  );

  const { error } = await supabase.from("orders").insert({
    booth_id: boothId,
    order_number: orderNumber,
    customer_name: input.customerName,
    items: input.items,
    total_cents: totalCents,
    status: "pending",
  });

  if (error) {
    if (error.code === "23505") {
      return placeOrder(boothId, input, attempt + 1);
    }
    return { success: false, error: error.message };
  }

  return { success: true, orderNumber };
}
