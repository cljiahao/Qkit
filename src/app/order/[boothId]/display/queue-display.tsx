"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePolling } from "@/hooks/use-polling";
import { playReadyChime, unlockAudio } from "@/lib/order-alerts";
import { getBoothQueueDisplay, type QueueDisplayOrder } from "./actions";
import type { OrderStatus } from "@/lib/types";

const POLL_MS = 5000;
// How long a just-ready tile keeps its "stamped" look (solid fill, tilted)
// before settling into the steady ready-tile style.
const FLASH_MS = 3500;

// This is a TV screen — no scrolling — so each column caps how many tiles it
// ever renders rather than overflowing off the bottom. Fixed numbers, not
// measured against the real viewport (no ResizeObserver): simple, predictable,
// easy to bump later if a vendor's screen visibly fits more or fewer. Ready
// tiles are bigger than Preparing tiles, so its cap is lower.
const MAX_VISIBLE_PREPARING = 12;
const MAX_VISIBLE_READY = 8;

interface Props {
  boothId: string;
  boothName: string;
  initialOrders: QueueDisplayOrder[];
}

/**
 * Public TV/second-screen queue display for one booth. Polls (no realtime —
 * see ./actions.ts) and, when an order transitions into "ready", gives it a
 * few seconds of "stamped" emphasis — solid fill, tilted -rotate-3 — reusing
 * the same fade-rise reveal the customer's own order-status page already
 * uses for its "Ready" stamp (../[orderNumber]/order-status-poller.tsx),
 * plus an optional chime once the vendor has tapped "Enable sound" (Web
 * Audio needs a user gesture to unlock — see ./README.md).
 */
export function QueueDisplay({ boothId, boothName, initialOrders }: Props) {
  const [orders, setOrders] = useState(initialOrders);
  const [justReady, setJustReady] = useState<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState(false);
  const prevStatusRef = useRef(
    new Map<string, OrderStatus>(
      initialOrders.map((o) => [o.orderNumber, o.status]),
    ),
  );
  const flashTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const timers = flashTimers.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  async function tick() {
    // A transient read failure keeps showing the last good state.
    const next = await getBoothQueueDisplay(boothId);
    if (!next) return;

    const prev = prevStatusRef.current;
    const newlyReady = next
      .filter(
        (o) => o.status === "ready" && prev.get(o.orderNumber) !== "ready",
      )
      .map((o) => o.orderNumber);
    prevStatusRef.current = new Map(next.map((o) => [o.orderNumber, o.status]));
    setOrders(next);

    if (newlyReady.length === 0) return;
    setJustReady((cur) => new Set([...cur, ...newlyReady]));
    if (soundEnabled) void playReadyChime();
    for (const orderNumber of newlyReady) {
      const timer = setTimeout(() => {
        flashTimers.current.delete(timer);
        setJustReady((cur) => {
          if (!cur.has(orderNumber)) return cur;
          const next = new Set(cur);
          next.delete(orderNumber);
          return next;
        });
      }, FLASH_MS);
      flashTimers.current.add(timer);
    }
  }

  usePolling(tick, { intervalMs: POLL_MS, enabled: true });

  const preparing = orders.filter((o) => o.status !== "ready");
  const ready = orders.filter((o) => o.status === "ready");

  const visiblePreparing = preparing.slice(0, MAX_VISIBLE_PREPARING);
  const hiddenPreparingCount = preparing.length - visiblePreparing.length;

  // A currently-flashing order must never be capped out — that flash is the
  // entire point of this screen. Give every justReady order a guaranteed
  // slot, then fill the rest of the cap from the normal sorted order.
  const flashingReady = ready.filter((o) => justReady.has(o.orderNumber));
  const otherReady = ready.filter((o) => !justReady.has(o.orderNumber));
  const visibleReady = [...flashingReady, ...otherReady].slice(
    0,
    MAX_VISIBLE_READY,
  );
  const hiddenReadyCount = ready.length - visibleReady.length;

  return (
    <div className="dark flex h-screen flex-col overflow-hidden bg-background px-8 py-8 text-foreground sm:px-12">
      <header className="flex shrink-0 items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">
          {boothName}
        </h1>
        {!soundEnabled && (
          <button
            type="button"
            onClick={() => {
              unlockAudio();
              setSoundEnabled(true);
            }}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground"
          >
            <Volume2 className="size-4" />
            Enable sound
          </button>
        )}
      </header>

      <div className="perforation my-6 shrink-0" />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-0">
        <section className="flex min-h-0 flex-col">
          <h2 className="mb-4 shrink-0 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Preparing
          </h2>
          {preparing.length === 0 ? (
            <p className="text-muted-foreground">No orders in progress</p>
          ) : (
            <>
              <div className="flex flex-wrap content-start gap-4 overflow-hidden">
                {visiblePreparing.map((o) => (
                  <div
                    key={o.orderNumber}
                    className="flex size-24 items-center justify-center rounded-2xl border border-border bg-card font-mono text-3xl font-bold sm:size-28 sm:text-4xl"
                  >
                    {o.displayNumber}
                  </div>
                ))}
              </div>
              {hiddenPreparingCount > 0 && (
                <p className="mt-3 shrink-0 border-t border-dashed border-border pt-2 text-sm text-muted-foreground">
                  +{hiddenPreparingCount} more preparing
                </p>
              )}
            </>
          )}
        </section>

        <section className="flex min-h-0 flex-col sm:border-l sm:border-dashed sm:border-border sm:pl-8">
          <h2 className="mb-4 shrink-0 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            Ready for pickup
          </h2>
          {ready.length === 0 ? (
            <p className="text-muted-foreground">Nothing ready yet</p>
          ) : (
            <>
              <div className="flex flex-wrap content-start gap-6 overflow-hidden">
                {visibleReady.map((o) => {
                  const flashing = justReady.has(o.orderNumber);
                  return (
                    <div
                      key={o.orderNumber}
                      className={cn(
                        "flex size-32 items-center justify-center rounded-2xl border-[3px] border-primary font-mono text-5xl font-bold sm:size-40 sm:text-6xl",
                        flashing
                          ? "fade-rise -rotate-3 bg-primary text-primary-foreground shadow-lg"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      {o.displayNumber}
                    </div>
                  );
                })}
              </div>
              {hiddenReadyCount > 0 && (
                <p className="mt-3 shrink-0 border-t border-dashed border-border pt-2 text-sm text-muted-foreground">
                  +{hiddenReadyCount} more ready
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
