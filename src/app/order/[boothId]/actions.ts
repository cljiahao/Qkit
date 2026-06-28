"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import {
  placeOrderSchema,
  parseBoothHours,
  parseMenuItems,
  parsePaymentConfig,
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

  // Throttle the public anonymous order POST per IP+booth so a script can't
  // flood the board. Fixed window: 8 orders / 60s. Fails open if the limiter
  // errors (don't block a real order on infra hiccups).
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown";
  const { data: allowed } = await supabase.rpc("check_rate_limit", {
    p_key: `order:${boothId}:${ip}`,
    p_limit: 8,
    p_window_seconds: 60,
  });
  if (allowed === false)
    return {
      success: false,
      error: "Too many orders too fast — wait a moment and try again.",
    };

  // Booth row, live stock, and serveability — independent, fetch together.
  // booth_servable is the authoritative gate (SECURITY DEFINER, same answer for
  // anyone): blocks ordering on a booth the owner isn't entitled to serve (e.g.
  // a free vendor's 2nd "paused" booth) even when the vendor is signed in and
  // their own-row RLS would otherwise expose it.
  const [{ data: booth }, { data: remainingData }, { data: servable }] =
    await Promise.all([
      supabase
        .from("booths")
        .select("is_active, hours, menu_items, payment")
        .eq("id", boothId)
        .single(),
      supabase.rpc("booth_remaining_stock", { p_booth_id: boothId }),
      supabase.rpc("booth_servable", { p_booth_id: boothId }),
    ]);
  if (!booth) return { success: false, error: "Booth not found" };
  if (servable === false)
    return {
      success: false,
      error: "This booth isn't taking orders right now",
    };
  const nowIso = new Date().toISOString();
  if (
    !isBoothOpen(
      { is_active: booth.is_active, hours: parseBoothHours(booth.hours) },
      nowIso,
    )
  )
    return { success: false, error: "This booth is closed" };

  // Soft cap: a rare simultaneous-tap oversell-by-one is acceptable and
  // self-heals on cancel; this rejects the obvious "just sold out" case.
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

  // Snapshot the booth's payment method onto the order so the queue knows
  // whether a payment is expected (and via which kind), frozen at order time.
  // 'stripe' is reserved-but-dark (no customer checkout path), so an order
  // under it expects no online payment — never leave it stuck at 'pending'.
  const paymentConfig = parsePaymentConfig(booth.payment);
  const expectsPayment = !!paymentConfig && paymentConfig.kind !== "stripe";
  const paymentStatus = expectsPayment ? "pending" : "not_required";

  const { error } = await supabase.from("orders").insert({
    booth_id: boothId,
    order_number: orderNumber,
    customer_name: order.customerName,
    items,
    total_cents: totalCents,
    // Orders land as "preparing" — no separate ack step; the booth starts
    // making it the moment it arrives.
    status: "preparing",
    payment_status: paymentStatus,
    payment_method_kind: expectsPayment ? paymentConfig.kind : null,
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
