"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import { OrderCard } from "@/components/order-card";
import { isTerminal, sortActiveOrders } from "@/lib/orders";
import { boothColor } from "@/lib/booth-color";
import { fireNewOrderNotification, playSound } from "@/lib/order-alerts";
import { cn } from "@/lib/utils";
import type { BoardOrder, BoardSettings } from "@/lib/types";

type BoothView = {
  id: string;
  name: string;
  is_active: boolean;
  open: boolean;
};

interface Props {
  booths: BoothView[];
  initialOrders: BoardOrder[];
  boardSettings: BoardSettings;
  // The initial server-side read errored — the board may be missing in-flight
  // orders, so warn instead of silently showing "All clear".
  loadError?: boolean;
}

type BoothFilter = "all" | string;

function LoadErrorBanner() {
  return (
    <div
      role="alert"
      className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700"
    >
      Couldn&apos;t load your current orders. Some in-flight orders may be
      missing. Refresh to try again.
    </div>
  );
}

export function RealtimeOrderBoard({
  booths,
  initialOrders,
  boardSettings,
  loadError = false,
}: Props) {
  const boothIds = booths.map((b) => b.id);
  const boothName = new Map(booths.map((b) => [b.id, b.name]));
  const [filter, setFilter] = useState<BoothFilter>("all");
  // new orders that arrived while hidden
  const [away, setAway] = useState(0);
  const originalTitle = useRef("");

  // Remember the tab title (post-hydration) so the away-badge can restore it.
  useEffect(() => {
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

  function handleNewOrder(order: BoardOrder) {
    void playSound(boardSettings.sound_id);
    toast(`New order #${order.order_number} · ${order.customer_name}`);
    if (document.hidden) {
      setAway((n) => n + 1);
      if (boardSettings.desktop_notify) {
        void fireNewOrderNotification(
          boothName.get(order.booth_id) ?? "QKit",
          order.order_number,
        );
      }
    }
  }

  const { orders, status: liveStatus } = useRealtimeOrders(
    boothIds,
    initialOrders,
    handleNewOrder,
  );

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

  // An empty booth list during a read error is almost certainly the error, not a
  // genuinely booth-less vendor — don't show the "No booths yet" onboarding.
  if (booths.length === 0 && loadError) {
    return <LoadErrorBanner />;
  }

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
      {loadError && <LoadErrorBanner />}
      {liveStatus === "disconnected" && (
        <div
          role="status"
          className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700"
        >
          Live updates interrupted, reconnecting. New orders may be delayed; the
          board re-syncs automatically once it&apos;s back.
        </div>
      )}
      <div
        data-tour="order-board"
        className="mb-7 flex items-end justify-between gap-3"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            The pass
          </p>
          <h1 className="font-display text-4xl font-semibold leading-none">
            Live orders
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="outline"
            size="icon"
            title="Board settings"
            className="rounded-full"
          >
            <Link href="/dashboard/settings" aria-label="Board settings">
              <SettingsIcon className="size-3.5" />
            </Link>
          </Button>
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
            No active orders. Standing by.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              boothName={multiBooth ? boothName.get(order.booth_id) : undefined}
              agingMin={boardSettings.aging_min}
              overdueMin={boardSettings.overdue_min}
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
