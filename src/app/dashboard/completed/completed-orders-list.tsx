"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { OrderCard } from "@/components/order-card";
import { Ticket } from "@/components/ticket";
import { Paginated } from "@/components/paginated";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [boothFilter, setBoothFilter] = useState("all");
  const [query, setQuery] = useState("");

  const filtered = orders.filter((o) => {
    if (boothFilter !== "all" && o.booth_id !== boothFilter) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      o.order_number.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q)
    );
  });

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

      <div className="mb-5 flex flex-wrap items-center gap-3">
        {multiBooth && (
          <Select value={boothFilter} onValueChange={setBoothFilter}>
            <SelectTrigger className="h-9 rounded-lg text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All booths</SelectItem>
              {booths.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order # or customer name"
            className="h-9 rounded-lg pl-9"
            aria-label="Search completed orders"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Ticket shadow="none" dashed className="mt-4 py-16 text-center">
          <p className="font-display text-xl font-semibold">
            No matching orders
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different order number, name, or booth.
          </p>
        </Ticket>
      ) : (
        <Paginated
          pageSize={12}
          alwaysShowCount
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              boothName={multiBooth ? boothName.get(order.booth_id) : undefined}
            />
          ))}
        </Paginated>
      )}
    </div>
  );
}
