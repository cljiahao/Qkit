"use server";

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/lib/types";

const boothIdSchema = z.string().uuid();

/**
 * Read the current status of one order. Polling fallback for the live status
 * page: Supabase realtime (WebSocket) is unreliable on Safari/iOS, so the
 * client also polls this every few seconds. Service client bypasses RLS —
 * customers are unauthenticated — and only the single status field leaks.
 */
export async function getOrderStatus(
  boothId: string,
  orderNumber: string,
): Promise<OrderStatus | null> {
  if (!boothIdSchema.safeParse(boothId).success) return null;

  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("orders")
    .select("status")
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .single();

  return data?.status ?? null;
}
