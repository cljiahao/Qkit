"use server";
import { z } from "zod";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { placeOrderSchema, type PlaceOrderInput } from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-result";

type Result = ActionResult<{
  orderNumber: string;
  boothId: string;
  accessToken: string;
}>;

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
  if (raw.includes("ORDER_RATE_LIMITED"))
    return "Too many orders too fast — wait a moment and try again.";
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

  // Anti-flood (best-effort; trusted-IP hardening is Phase B). Fails open. This
  // is the honest-path per-IP guard; place_order also carries a booth-scoped
  // limiter so a direct RPC call that skips this action is still bounded.
  const ip = clientIp(await headers());
  const allowed = await rateLimit(supabase, `order:${code}:${ip}`, 8, 60);
  if (!allowed)
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
  if (error) {
    const message = messageFor(error.message);
    // Log only unexpected failures (those that fall through to the generic
    // message). Known business raises — sold out, expired, unservable, rate
    // limited — are normal outcomes, not bugs, so they'd only be log noise.
    if (message === "Could not place order. Please try again.")
      console.error("placeOrder failed", error.message);
    return { success: false, error: message };
  }
  const out = z
    .object({
      order_number: z.string(),
      booth_id: z.string(),
      access_token: z.string(),
    })
    .safeParse(data);
  if (!out.success) {
    // The RPC succeeded but returned an unexpected shape — a real bug worth a log.
    console.error("placeOrder: malformed RPC output", JSON.stringify(data));
    return {
      success: false,
      error: "Could not place order. Please try again.",
    };
  }
  return {
    success: true,
    orderNumber: out.data.order_number,
    boothId: out.data.booth_id,
    accessToken: out.data.access_token,
  };
}
