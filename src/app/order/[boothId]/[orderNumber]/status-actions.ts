"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { parseOrderRef } from "@/lib/schemas";
import type { OrderStatus } from "@/lib/types";

/**
 * Read the current status of one order. Polling fallback for the live status
 * page: Supabase realtime (WebSocket) is unreliable on Safari/iOS, so the
 * client also polls this every few seconds. Service client bypasses RLS —
 * customers are unauthenticated — and only the single status field leaks.
 */
export async function getOrderStatus(
  boothId: string,
  orderNumber: string,
  token: string,
): Promise<OrderStatus | null> {
  if (!parseOrderRef(boothId, orderNumber, token).ok) return null;

  const supabase = await createServiceClient();
  // maybeSingle (not single): a not-yet-readable / unknown order is a normal
  // null, not an error — only real DB/network failures should surface in logs.
  // The token match is what authorizes the read (booth_id + number aren't secret).
  const { data, error } = await supabase
    .from("orders")
    .select("status")
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .maybeSingle();
  if (error) console.error("getOrderStatus failed", error.message);

  return data?.status ?? null;
}
