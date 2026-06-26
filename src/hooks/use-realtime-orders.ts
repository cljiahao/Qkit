"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  applyRealtimeOrderEvent,
  parseRealtimeOrderEvent,
} from "@/lib/realtime-orders";
import type { Order } from "@/lib/types";

export function useRealtimeOrders(
  boothIds: string[],
  initialOrders: Order[],
  onInsert?: (order: Order) => void,
) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const supabase = createClient();
  const filterString = useMemo(() => boothIds.join(","), [boothIds]);

  // Hold the latest callback in a ref so a fresh closure each render doesn't
  // force a channel re-subscribe.
  const onInsertRef = useRef(onInsert);
  useEffect(() => {
    onInsertRef.current = onInsert;
  });

  useEffect(() => {
    if (boothIds.length === 0) return;

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // supabase client and setOrders are stable; only the booth filter should
    // trigger re-subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterString]);

  return orders;
}
