"use client";

import { OrderCard } from "@/components/order-card";
import { Ticket } from "@/components/ticket";
import { Paginated } from "@/components/paginated";
import type { BoardOrder } from "@/lib/types";

interface Booth {
  id: string;
  name: string;
}

export function CompletedOrdersList({
  booths,
  orders,
  loadError,
  historyLimit,
}: {
  booths: Booth[];
  orders: BoardOrder[];
  loadError: boolean;
  historyLimit: number;
}) {
  const boothName = new Map(booths.map((b) => [b.id, b.name]));
  const multiBooth = booths.length > 1;

  if (loadError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700"
      >
        Couldn&apos;t load your completed orders. Refresh to try again.
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <Ticket shadow="none" dashed className="mt-10 py-20 text-center">
        <p className="font-display text-2xl font-semibold">
          No completed orders yet
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Orders you mark picked up show up here.
        </p>
      </Ticket>
    );
  }

  return (
    <div>
      {orders.length === historyLimit && (
        <p className="mb-4 text-xs text-muted-foreground">
          Showing your most recent {historyLimit} completed orders.
        </p>
      )}
      <Paginated
        pageSize={12}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            boothName={multiBooth ? boothName.get(order.booth_id) : undefined}
          />
        ))}
      </Paginated>
    </div>
  );
}
