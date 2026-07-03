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
    if (!data) return;
    // MERGE by id (don't hard-replace): a realtime INSERT/UPDATE can land between
    // this snapshot being read and applied, and a blanket setOrders(data) would
    // clobber it — a just-placed order (its toast/sound already fired) would
    // vanish from the board. Keep the newer of {local, snapshot} per id by
    // updated_at, and never drop a local id just because it's absent from the
    // snapshot (terminal orders are filtered at render anyway).
    setOrders((prev) => {
      const byId = new Map(prev.map((o) => [o.id, o]));
      for (const row of data) {
        const existing = byId.get(row.id);
        if (!existing || row.updated_at >= existing.updated_at)
          byId.set(row.id, row);
      }
      return [...byId.values()];
    });
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
