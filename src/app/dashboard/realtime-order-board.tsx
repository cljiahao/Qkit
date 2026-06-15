"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import { OrderCard } from "@/components/order-card";
import { isTerminal, sortActiveOrders } from "@/lib/orders";
import { boothColor } from "@/lib/booth-color";
import { playReadyChime } from "@/lib/order-alerts";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/types";

type BoothView = {
  id: string;
  name: string;
  is_active: boolean;
  open: boolean;
};

interface Props {
  booths: BoothView[];
  initialOrders: Order[];
}

type BoothFilter = "all" | string;

export function RealtimeOrderBoard({ booths, initialOrders }: Props) {
  const boothIds = booths.map((b) => b.id);
  const [filter, setFilter] = useState<BoothFilter>("all");
  const [soundOn, setSoundOn] = useState(false);
  const [away, setAway] = useState(0); // new orders that arrived while hidden
  const originalTitle = useRef("");

  // Restore the sound preference + remember the tab title (post-hydration).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSoundOn(localStorage.getItem("qkit:sound") === "on");
    originalTitle.current = document.title;
  }, []);

  // Clear the "while away" badge the moment the vendor looks back at the tab.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) setAway(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Reflect the away-count in the tab title so a backgrounded vendor notices.
  useEffect(() => {
    if (away > 0) document.title = `(${away}) New orders · QKit`;
    else if (originalTitle.current) document.title = originalTitle.current;
  }, [away]);

  function handleNewOrder(order: Order) {
    if (soundOn) playReadyChime();
    toast(`New order #${order.order_number} · ${order.customer_name}`);
    if (document.hidden) setAway((n) => n + 1);
  }

  function toggleSound() {
    setSoundOn((on) => {
      const next = !on;
      localStorage.setItem("qkit:sound", next ? "on" : "off");
      if (next) playReadyChime(); // this tap unlocks the AudioContext
      return next;
    });
  }

  const orders = useRealtimeOrders(boothIds, initialOrders, handleNewOrder);

  const boothName = new Map(booths.map((b) => [b.id, b.name]));

  const active = sortActiveOrders(orders.filter((o) => !isTerminal(o.status)));
  const activeCountFor = (id: string) =>
    active.filter((o) => o.booth_id === id).length;

  // A booth's tab shows only if it's active OR still has orders in flight — a
  // turned-off booth with a queue stays until it clears, then self-removes.
  const visibleBooths = booths.filter(
    (b) => b.is_active || activeCountFor(b.id) > 0,
  );
  const multiBooth = visibleBooths.length > 1;

  // If the selected booth's tab vanished, fall back to All.
  const effectiveFilter =
    filter !== "all" && !visibleBooths.some((b) => b.id === filter)
      ? "all"
      : filter;
  const visible =
    effectiveFilter === "all"
      ? active
      : active.filter((o) => o.booth_id === effectiveFilter);

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

  const idle = visible.length === 0;
  // Single-booth boards show an open/closed pill in the header (multi-booth gets
  // it per tab instead).
  const soleBooth = visibleBooths.length === 1 ? visibleBooths[0] : null;

  return (
    <div>
      <div className="mb-7 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            The pass
          </p>
          <h1 className="font-display text-4xl font-semibold leading-none">
            Live orders
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundOn}
            title={soundOn ? "New-order sound on" : "New-order sound off"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
              soundOn
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            {soundOn ? (
              <Bell className="size-3.5" />
            ) : (
              <BellOff className="size-3.5" />
            )}
            <span className="hidden sm:inline">
              {soundOn ? "Sound on" : "Sound off"}
            </span>
          </button>
          {soleBooth && !soleBooth.open && (
            <span className="inline-flex items-center rounded-full border border-border bg-secondary px-3 py-1.5 text-sm font-semibold text-muted-foreground">
              Closed
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold",
              idle
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-primary/10 text-primary",
            )}
          >
            <span className="relative flex size-2">
              {!idle && (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              )}
              <span
                className={cn(
                  "relative inline-flex size-2 rounded-full",
                  idle ? "bg-emerald-500" : "bg-primary",
                )}
              />
            </span>
            {idle ? "All clear" : `${visible.length} active`}
          </span>
        </div>
      </div>

      {multiBooth && (
        <div className="mb-6 flex flex-wrap gap-2">
          <BoothTab
            label="All"
            count={active.length}
            active={effectiveFilter === "all"}
            onClick={() => setFilter("all")}
          />
          {visibleBooths.map((b) => (
            <BoothTab
              key={b.id}
              label={b.name}
              color={boothColor(b.id)}
              count={activeCountFor(b.id)}
              open={b.open}
              active={effectiveFilter === b.id}
              onClick={() => setFilter(b.id)}
            />
          ))}
        </div>
      )}

      {idle ? (
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
  open,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  color?: string;
  open?: boolean;
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
      {open === false && (
        <span className="text-[0.6rem] font-bold uppercase tracking-wide opacity-70">
          closed
        </span>
      )}
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
