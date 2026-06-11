"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import { OrderCard } from "@/components/order-card";
import { sortActiveOrders } from "@/lib/orders";
import { boothColor } from "@/lib/booth-color";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/types";

interface Props {
  booths: { id: string; name: string }[];
  initialOrders: Order[];
}

type BoothFilter = "all" | string;

export function RealtimeOrderBoard({ booths, initialOrders }: Props) {
  const boothIds = booths.map((b) => b.id);
  const orders = useRealtimeOrders(boothIds, initialOrders);
  const [filter, setFilter] = useState<BoothFilter>("all");

  const multiBooth = booths.length > 1;
  const boothName = new Map(booths.map((b) => [b.id, b.name]));

  const active = sortActiveOrders(
    orders.filter((o) => o.status !== "completed" && o.status !== "cancelled"),
  );
  const visible =
    filter === "all" ? active : active.filter((o) => o.booth_id === filter);

  if (booths.length === 0) {
    return (
      <div className="ticket mx-auto mt-10 max-w-md overflow-hidden rounded-2xl border border-dashed border-border p-10 text-center">
        <p className="font-display text-2xl font-semibold">No booths yet</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Set up a booth to start receiving orders. Once it&apos;s live, every
          order lands here in real time.
        </p>
        <Button asChild className="mt-6 rounded-lg">
          <Link href="/dashboard/booths/new">
            <Plus className="size-4" /> Add your first booth
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-7 flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            The pass
          </p>
          <h1 className="font-display text-4xl font-semibold leading-none">
            Live orders
          </h1>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          {visible.length} active
        </span>
      </div>

      {multiBooth && (
        <div className="mb-6 flex flex-wrap gap-2">
          <BoothTab
            label="All"
            count={active.length}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {booths.map((b) => (
            <BoothTab
              key={b.id}
              label={b.name}
              color={boothColor(b.id)}
              count={active.filter((o) => o.booth_id === b.id).length}
              active={filter === b.id}
              onClick={() => setFilter(b.id)}
            />
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="ticket mt-10 overflow-hidden rounded-2xl border border-dashed border-border py-20 text-center">
          <p className="font-display text-2xl font-semibold">All caught up</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No active orders — standing by.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              boothName={multiBooth ? boothName.get(order.booth_id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BoothTab({
  label,
  count,
  active,
  onClick,
  color,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-secondary",
      )}
    >
      {color && (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="max-w-[10rem] truncate">{label}</span>
      <span
        className={cn(
          "rounded-full px-1.5 text-xs tabular-nums",
          active ? "bg-primary-foreground/20" : "bg-secondary",
        )}
      >
        {count}
      </span>
    </button>
  );
}
