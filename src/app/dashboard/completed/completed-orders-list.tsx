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
import { cn } from "@/lib/utils";
import type { BoardOrder } from "@/lib/types";

interface Booth {
  id: string;
  name: string;
}

type DateRange = "today" | "7d" | "30d" | "all";

const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

// Ms since the range's cutoff, or null for "all" (no filtering). A plain
// function (not memoized against a fixed "now") — only called from the
// filter below, itself only reached once a vendor picks a non-"all" range,
// so the SSR/hydration-mismatch risk a fixed initial Date.now() would carry
// doesn't apply: the default render (both server and client) is "all".
function rangeCutoffMs(range: DateRange): number | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  const days = range === "7d" ? 7 : 30;
  return now.getTime() - days * 24 * 60 * 60 * 1000;
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
  const [dateRange, setDateRange] = useState<DateRange>("all");

  const cutoffMs = rangeCutoffMs(dateRange);
  const filtered = orders.filter((o) => {
    if (boothFilter !== "all" && o.booth_id !== boothFilter) return false;
    if (cutoffMs !== null) {
      const completedMs = Date.parse(o.completed_at ?? o.created_at);
      if (completedMs < cutoffMs) return false;
    }
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
        <div className="inline-flex rounded-lg border border-border p-0.5 text-sm">
          {DATE_RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setDateRange(r.value)}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors",
                dateRange === r.value
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
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
            Try a different order number, name, booth, or date range.
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
              showDate
            />
          ))}
        </Paginated>
      )}
    </div>
  );
}
