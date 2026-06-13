"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { OrderStatusBadge } from "@/components/order-status-badge";
import {
  fireReadyNotification,
  isNotifySupported,
  notifyPermission,
  playReadyChime,
  requestNotifyPermission,
} from "@/lib/order-alerts";
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
  boothName: string;
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
  boothName,
}: Props) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  // null until known (avoids SSR/hydration mismatch); "default" = can ask.
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPermission(notifyPermission());
  }, []);

  async function onEnableNotify() {
    setRequesting(true);
    const result = await requestNotifyPermission();
    setPermission(result);
    setRequesting(false);
    // Unlock the AudioContext on this gesture so the later chime can play.
    if (result === "granted") playReadyChime();
  }

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

  // Alert the moment the order flips to ready. setState bails on an identical
  // value, so this fires once per real transition, not every poll.
  useEffect(() => {
    if (status !== "ready") return;

    // System popup — reaches the customer even with the tab backgrounded
    // (where supported + granted); a no-op otherwise.
    fireReadyNotification(boothName, orderNumber);

    if (!document.hidden) {
      playReadyChime();
      return;
    }

    // Backgrounded: flash the tab title until the customer comes back, then
    // restore it and chime once they're looking.
    const original = document.title;
    let on = false;
    const flash = setInterval(() => {
      on = !on;
      document.title = on ? "🔔 Order ready!" : original;
    }, 1000);
    function onVisible() {
      if (document.hidden) return;
      clearInterval(flash);
      document.title = original;
      playReadyChime();
      document.removeEventListener("visibilitychange", onVisible);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(flash);
      document.title = original;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, boothName, orderNumber]);

  const completed = status === "completed";
  const cancelled = status === "cancelled";
  // completed sits past the last step; cancelled has no progress.
  const activeIndex = completed ? STEPS.length - 1 : STEPS.indexOf(status);

  // Offer the notify opt-in only while still waiting — moot once ready/done.
  const waiting = !["ready", "completed", "cancelled"].includes(status);
  const canAsk = waiting && isNotifySupported() && permission === "default";
  const willNotify = waiting && permission === "granted";

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

      {canAsk && (
        <button
          type="button"
          onClick={onEnableNotify}
          disabled={requesting}
          className="mx-auto flex items-center gap-2 rounded-full border border-primary/40 bg-primary/[0.04] px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
        >
          <Bell className="size-4" />
          {requesting ? "Just a sec…" : "Notify me when it's ready"}
        </button>
      )}

      {willNotify && (
        <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground">
          <BellRing className="size-3.5 text-primary" />
          We&apos;ll alert you the moment it&apos;s ready
        </p>
      )}
    </div>
  );
}
