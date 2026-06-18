"use server";

import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import {
  placeOrderSchema,
  parseBoothHours,
  parseMenuItems,
  type PlaceOrderInput,
} from "@/lib/schemas";
import { isBoothOpen } from "@/lib/hours";
import { cartTotal } from "@/lib/cart";
import { overStockLines, parseRemaining } from "@/lib/stock";
import type { ActionResult } from "@/lib/action-result";

type PlaceOrderResult = ActionResult<{ orderNumber: string }>;

const boothIdSchema = z.string().uuid();

export async function placeOrder(
  boothId: string,
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  // Server-side validation — the client form only validates customerName,
  // so items arrive here untrusted. Never trust client validation.
  if (!boothIdSchema.safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };

  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: "Invalid order details" };
  const order = parsed.data;

  const supabase = await createServerClient();

  // Re-check the booth is open server-side — never trust the client's state.
  const { data: booth } = await supabase
    .from("booths")
    .select("is_active, hours, menu_items")
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

  // Re-check sold-out caps server-side against live remaining (counts only).
  // Soft cap: a rare simultaneous-tap oversell-by-one is acceptable and
  // self-heals on cancel; this rejects the obvious "just sold out" case.
  const { data: remainingData } = await supabase.rpc("booth_remaining_stock", {
    p_booth_id: boothId,
  });
  if (overStockLines(order.items, parseRemaining(remainingData)).length > 0)
    return {
      success: false,
      error: "Sorry — an item just sold out. Please adjust your order.",
    };

  // Atomically claim a unique order number. The DB function row-locks the
  // booth's counter, so concurrent/duplicate submits can never collide on
  // UNIQUE (booth_id, order_number) — no retry loop needed.
  const { data: orderNumber, error: numError } = await supabase.rpc(
    "next_order_number",
    { p_booth_id: boothId },
  );

  if (numError || !orderNumber)
    return { success: false, error: "Failed to generate order number" };

  const totalCents = cartTotal(order.items);

  // Snapshot each line's vendor cost from the booth menu (cost never travels
  // through the client). Frozen onto the order so margin stats stay accurate
  // even if the vendor edits costs later.
  const costByItem = new Map(
    parseMenuItems(booth.menu_items).map((m) => [m.id, m.cost_cents]),
  );
  const items = order.items.map((it) => {
    const cost = costByItem.get(it.menuItemId);
    return cost != null ? { ...it, cost_cents: cost } : it;
  });

  const { error } = await supabase.from("orders").insert({
    booth_id: boothId,
    order_number: orderNumber,
    customer_name: order.customerName,
    items,
    total_cents: totalCents,
    // Orders land as "preparing" — no separate ack step; the booth starts
    // making it the moment it arrives.
    status: "preparing",
  });

  if (error) {
    console.error("placeOrder insert failed", error.message);
    return {
      success: false,
      error: "Could not place order. Please try again.",
    };
  }

  return { success: true, orderNumber };
}
