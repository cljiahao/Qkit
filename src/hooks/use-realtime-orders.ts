"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  applyRealtimeOrderEvent,
  parseRealtimeOrderEvent,
} from "@/lib/realtime-orders";
import type { Order } from "@/lib/types";

export type RealtimeStatus = "connecting" | "connected" | "disconnected";

export function useRealtimeOrders(
  boothIds: string[],
  initialOrders: Order[],
  onInsert?: (order: Order) => void,
): { orders: Order[]; status: RealtimeStatus } {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const supabase = createClient();
  const filterString = useMemo(() => boothIds.join(","), [boothIds]);

  // Hold the latest callback in a ref so a fresh closure each render doesn't
  // force a channel re-subscribe.
  const onInsertRef = useRef(onInsert);
  useEffect(() => {
    onInsertRef.current = onInsert;
  });

  // Re-fetch the active-order set (mirrors the dashboard server query in
  // dashboard/page.tsx) to heal any events missed while the socket was down.
  // RLS scopes it to the vendor's own booths.
  const resync = useCallback(async () => {
    if (boothIds.length === 0) return;
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .in("booth_id", boothIds)
      .not("status", "in", "(completed,cancelled)")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("useRealtimeOrders resync failed", error.message);
      return;
    }
    if (data) setOrders(data);
    // supabase is stable; only the booth filter identity matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterString]);

  // Whether the channel has been SUBSCRIBED at least once this mount. A
  // SUBSCRIBED that follows a drop triggers a reconciliation refetch; the very
  // first one does not (the server already handed us the initial set).
  const wasConnected = useRef(false);

  useEffect(() => {
    if (boothIds.length === 0) return;
    wasConnected.current = false;

    const channel = supabase
      .channel("vendor-orders")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `booth_id=in.(${filterString})`,
        },
        (payload) => {
          // Realtime payloads are untrusted — validate before use.
          const event = parseRealtimeOrderEvent(payload);
          if (!event) return;
          setOrders((prev) => applyRealtimeOrderEvent(prev, event));
          if (event.type === "INSERT") onInsertRef.current?.(event.order);
        },
      )
      // Surface the connection lifecycle instead of freezing silently: on a
      // reconnect (SUBSCRIBED after a prior drop) refetch to catch up; on
      // CHANNEL_ERROR/TIMED_OUT/CLOSED mark the board as disconnected so it can
      // warn the vendor rather than showing a stale queue as if it were live.
      .subscribe((channelStatus) => {
        if (channelStatus === "SUBSCRIBED") {
          setStatus("connected");
          if (wasConnected.current) void resync();
          wasConnected.current = true;
        } else if (
          channelStatus === "CHANNEL_ERROR" ||
          channelStatus === "TIMED_OUT" ||
          channelStatus === "CLOSED"
        ) {
          setStatus("disconnected");
          console.warn("useRealtimeOrders channel status:", channelStatus);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // supabase client and setOrders are stable; only the booth filter should
    // trigger re-subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterString]);

  return { orders, status };
}
