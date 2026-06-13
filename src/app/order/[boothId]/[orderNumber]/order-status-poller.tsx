"use client";

import { useEffect, useState } from "react";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { getOrderStatus } from "./status-actions";
import type { OrderStatus } from "@/lib/types";

// Poll cadence. The customer status page is poll-only by design: Supabase
// realtime (WebSocket) is unreliable on the devices customers actually use —
// Safari/iOS and in-app webviews (Instagram/WhatsApp/WeChat) flaky-block or
// drop the socket. Order status changes on a minute scale, so a few seconds of
// latency is fine and a poll works everywhere. The vendor dashboard, on
// desktop where latency matters, keeps realtime.
const POLL_MS = 5000;
const TERMINAL: OrderStatus[] = ["completed", "cancelled"];

interface Props {
  boothId: string;
  orderNumber: string;
  initialStatus: OrderStatus;
}

const STATUS_MESSAGE: Record<OrderStatus, string> = {
  pending: "Your order is being reviewed",
  confirmed: "Your order has been confirmed",
  preparing: "Your order is being prepared",
  ready: "Your order is ready for pickup!",
  completed: "Order complete — enjoy!",
  cancelled: "Your order was cancelled",
};

// Live flow is preparing → ready (2 steps). STATUS_MESSAGE retains the legacy
// pending/confirmed keys so any pre-v2 order still renders a message.
const STEPS: OrderStatus[] = ["preparing", "ready"];

export function OrderStatusPoller({
  boothId,
  orderNumber,
  initialStatus,
}: Props) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus);

  // Poll the status until it reaches a terminal state. Works on every browser
  // (no WebSocket dependency). Polling pauses while the tab is backgrounded
  // (phone pocketed) and resumes with an immediate refresh on return — saves
  // needless DB hits and gives a fresh status the instant the customer looks.
  useEffect(() => {
    if (TERMINAL.includes(status)) return;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function tick() {
      if (document.hidden) return;
      const next = await getOrderStatus(boothId, orderNumber);
      if (!stopped && next) setStatus(next);
    }
    function start() {
      if (!timer) timer = setInterval(tick, POLL_MS);
    }
    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    }
    function onVisibility() {
      if (document.hidden) {
        stop();
      } else {
        void tick();
        start();
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) {
      void tick(); // catch a change between SSR and hydration
      start();
    }
    return () => {
      stopped = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [boothId, orderNumber, status]);

  const completed = status === "completed";
  const cancelled = status === "cancelled";
  // completed sits past the last step; cancelled has no progress.
  const activeIndex = completed ? STEPS.length - 1 : STEPS.indexOf(status);

  return (
    <div className="space-y-5 px-6 py-6 text-center">
      <div className="flex justify-center">
        <OrderStatusBadge status={status} />
      </div>

      {!cancelled && (
        <div className="flex items-center gap-1.5">
          {STEPS.map((step, i) => (
            <div
              key={step}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= activeIndex ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>
      )}

      <p
        className={`font-display text-xl font-semibold ${
          status === "ready" ? "text-status-ready" : ""
        }`}
      >
        {STATUS_MESSAGE[status]}
      </p>

      {status === "ready" && (
        <p className="animate-pulse text-sm font-medium text-status-ready">
          Please collect your order now
        </p>
      )}
    </div>
  );
}
