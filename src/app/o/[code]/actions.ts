"use server";
import { z } from "zod";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { placeOrderSchema, type PlaceOrderInput } from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-result";

type Result = ActionResult<{ orderNumber: string; boothId: string }>;

const codeSchema = z.string().min(1).max(64);
const idemSchema = z.string().uuid();

// Map a place_order RAISE prefix to a customer-facing message.
function messageFor(raw: string): string {
  if (raw.includes("ORDER_EXPIRED"))
    return "This code expired — please rescan.";
  if (raw.includes("ORDER_UNSERVABLE"))
    return "This booth isn't taking orders right now";
  if (raw.includes("ORDER_SOLD_OUT") || raw.includes("ORDER_ITEM_UNAVAILABLE"))
    return "Sorry — an item just sold out. Please adjust your order.";
  return "Could not place order. Please try again.";
}

export async function placeOrder(
  code: string,
  input: PlaceOrderInput,
  idempotencyKey: string,
): Promise<Result> {
  if (!codeSchema.safeParse(code).success)
    return { success: false, error: "This code expired — please rescan." };
  if (!idemSchema.safeParse(idempotencyKey).success)
    return { success: false, error: "Invalid request" };
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: "Invalid order details" };

  const supabase = await createServerClient();

  // Anti-flood (best-effort; trusted-IP hardening is Phase B). Fails open.
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown";
  const { data: allowed } = await supabase.rpc("check_rate_limit", {
    p_key: `order:${code}:${ip}`,
    p_limit: 8,
    p_window_seconds: 60,
  });
  if (allowed === false)
    return {
      success: false,
      error: "Too many orders too fast — wait a moment and try again.",
    };

  const { data, error } = await supabase.rpc("place_order", {
    p_short_code: code,
    p_customer_name: parsed.data.customerName,
    p_items: parsed.data.items,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return { success: false, error: messageFor(error.message) };
  const out = z
    .object({ order_number: z.string(), booth_id: z.string() })
    .safeParse(data);
  if (!out.success)
    return {
      success: false,
      error: "Could not place order. Please try again.",
    };
  return {
    success: true,
    orderNumber: out.data.order_number,
    boothId: out.data.booth_id,
  };
}
