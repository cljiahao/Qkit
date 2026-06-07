"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { orderRowSchema } from "@/lib/schemas";
import type { Order } from "@/lib/types";

export function useRealtimeOrders(boothIds: string[], initialOrders: Order[]) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const supabase = createClient();
  const filterString = useMemo(() => boothIds.join(","), [boothIds]);

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
          if (payload.eventType === "DELETE") {
            const id = payload.old?.id;
            if (typeof id !== "string") return;
            setOrders((prev) => prev.filter((o) => o.id !== id));
            return;
          }

          // Realtime payloads are untrusted — validate before use.
          const parsed = orderRowSchema.safeParse(payload.new);
          if (!parsed.success) return;
          const order: Order = parsed.data;

          if (payload.eventType === "INSERT") {
            setOrders((prev) => [order, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setOrders((prev) =>
              prev.map((o) => (o.id === order.id ? order : o)),
            );
          }
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
