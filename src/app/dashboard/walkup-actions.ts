"use server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { placeOrderSchema, type PlaceOrderInput } from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-result";

type Result = ActionResult<{ orderNumber: string; accessToken: string }>;

const boothIdSchema = z.string().uuid();

// Map a place_walkup_order RAISE prefix to a vendor-facing message. Mirrors
// o/[code]/actions.ts#messageFor, minus the customer-only cases (ORDER_
// EXPIRED, ORDER_UNSERVABLE) that don't apply here — staff standing at the
// counter is the authority on whether they can take this order, not the
// booth's schedule/serviceability (see migration 0060's comment).
function messageFor(raw: string): string {
  if (raw.includes("ORDER_UNAUTHORIZED")) return "Not your booth.";
  if (raw.includes("ORDER_SOLD_OUT") || raw.includes("ORDER_ITEM_UNAVAILABLE"))
    return "An item just sold out — adjust the order.";
  if (raw.includes("ORDER_RATE_LIMITED"))
    return "Too many orders too fast — wait a moment and try again.";
  return "Could not place order. Please try again.";
}

/**
 * Staff-entered order from the dashboard live board, for a customer at the
 * counter (no QR/phone). Goes through place_walkup_order (migration 0060) —
 * a SECURITY DEFINER RPC that checks the caller owns boothId, reprices every
 * line from the stored menu (same trust boundary as the customer path — a
 * client-sent price is never trusted), and stamps source='walkup'. Reuses
 * placeOrderSchema: identical item shape to the customer cart.
 */
export async function placeWalkupOrder(
  boothId: string,
  input: PlaceOrderInput,
): Promise<Result> {
  if (!boothIdSchema.safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: "Invalid order details" };

  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc("place_walkup_order", {
    p_booth_id: boothId,
    p_customer_name: parsed.data.customerName,
    p_items: parsed.data.items,
  });
  if (error) {
    const message = messageFor(error.message);
    if (message === "Could not place order. Please try again.")
      console.error("placeWalkupOrder failed", error.message);
    return { success: false, error: message };
  }

  const out = z
    .object({ order_number: z.string(), access_token: z.string() })
    .safeParse(data);
  if (!out.success) {
    console.error(
      "placeWalkupOrder: malformed RPC output",
      JSON.stringify(data),
    );
    return {
      success: false,
      error: "Could not place order. Please try again.",
    };
  }

  return {
    success: true,
    orderNumber: out.data.order_number,
    accessToken: out.data.access_token,
  };
}
