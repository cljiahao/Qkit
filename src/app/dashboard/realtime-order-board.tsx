"use client";

import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import { OrderCard } from "@/components/order-card";
import type { Order } from "@/lib/types";

interface Props {
  booths: { id: string; name: string }[];
  initialOrders: Order[];
}

export function RealtimeOrderBoard({ booths, initialOrders }: Props) {
  const boothIds = booths.map((b) => b.id);
  const orders = useRealtimeOrders(boothIds, initialOrders);
  const active = orders.filter(
    (o) => o.status !== "completed" && o.status !== "cancelled",
  );

  if (booths.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-muted-foreground text-lg">No booths yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Set up a booth in Supabase to start receiving orders
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Live Orders</h1>
        <span className="text-sm text-muted-foreground">
          {active.length} active
        </span>
      </div>
      {active.length === 0 ? (
        <p className="text-muted-foreground text-center py-16">
          No active orders — standing by
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {active.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
