"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { parseOrderRef } from "@/lib/schemas";
import { ordersAheadOf } from "@/lib/orders";
import { estimateWaitSeconds, type StatsOrder } from "@/lib/stats";
import type { OrderStatus } from "@/lib/types";

// Active (non-terminal) statuses that occupy a spot in the live queue.
const ACTIVE_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
];

// How many of the booth's most recent completed orders feed the rolling
// wait-time average — see docs/superpowers/specs/2026-07-18-live-wait-time-
// estimate-design.md for why a recent window, not the full history.
const RECENT_ORDER_LIMIT = 20;

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

export type WaitEstimate = {
  // null whenever there isn't enough recent history to trust a time-based
  // estimate — see estimateWaitSeconds's own minimum-sample-size guard. The
  // page falls back to `ordersAhead` (a queue-position label) instead of
  // showing nothing — see queuePositionLabel in @/lib/orders.
  seconds: number | null;
  ordersAhead: number;
};

/**
 * Live "ready in ~N min" estimate for one order — recent average prep time
 * (this booth's last RECENT_ORDER_LIMIT completed orders) times how many
 * orders currently rank ahead of it. Polled the same cadence as
 * getOrderStatus (this page is poll-only by design, not realtime — see
 * order-status-poller.tsx), so this recomputes live as the queue moves, not
 * a one-time snapshot. Returns null only when there's nothing to say at all
 * (invalid token, order not found) — `ordersAhead` is otherwise always
 * computable and returned even when `seconds` isn't.
 */
export async function getWaitEstimate(
  boothId: string,
  orderNumber: string,
  token: string,
): Promise<WaitEstimate | null> {
  if (!parseOrderRef(boothId, orderNumber, token).ok) return null;

  const supabase = await createServiceClient();

  const { data: target, error: targetError } = await supabase
    .from("orders")
    .select("id, status, created_at, priority_bumped_at")
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .maybeSingle();
  if (targetError) {
    console.error("getWaitEstimate: target read failed", targetError.message);
    return null;
  }
  if (!target) return null;

  const { data: active, error: activeError } = await supabase
    .from("orders")
    .select("id, status, created_at, priority_bumped_at")
    .eq("booth_id", boothId)
    .in("status", ACTIVE_STATUSES);
  if (activeError) {
    console.error("getWaitEstimate: active read failed", activeError.message);
    return null;
  }

  const { data: recent, error: recentError } = await supabase
    .from("orders")
    .select("status, created_at, ready_at, total_cents, items")
    .eq("booth_id", boothId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(RECENT_ORDER_LIMIT);
  if (recentError) {
    console.error("getWaitEstimate: recent read failed", recentError.message);
    return null;
  }

  const ordersAhead = ordersAheadOf(active ?? [], target);
  const seconds = estimateWaitSeconds(
    (recent ?? []) as StatsOrder[],
    ordersAhead,
  );
  return { seconds, ordersAhead };
}
