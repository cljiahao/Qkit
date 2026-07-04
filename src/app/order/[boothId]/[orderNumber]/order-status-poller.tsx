"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { usePolling } from "@/hooks/use-polling";
import { OrderStatusBadge } from "@/components/order-status-badge";
import {
  fireReadyNotification,
  isNotifySupported,
  notifyPermission,
  playReadyChime,
  requestNotifyPermission,
  unlockAudio,
} from "@/lib/order-alerts";
import { getOrderStatus } from "./status-actions";
import { elapsedLabel, isTerminal } from "@/lib/orders";
import type { OrderStatus } from "@/lib/types";

// Poll cadence. The customer status page is poll-only by design: Supabase
// realtime (WebSocket) is unreliable on the devices customers actually use —
// Safari/iOS and in-app webviews (Instagram/WhatsApp/WeChat) flaky-block or
// drop the socket. Order status changes on a minute scale, so a few seconds of
// latency is fine and a poll works everywhere. The vendor dashboard, on
// desktop where latency matters, keeps realtime.
const POLL_MS = 5000;

interface Props {
  boothId: string;
  orderNumber: string;
  token: string;
  initialStatus: OrderStatus;
  boothName: string;
  placedAt: string; // ISO created_at, for the "placed N min ago" stamp
}

const STATUS_MESSAGE: Record<OrderStatus, string> = {
  pending: "Your order is being reviewed",
  confirmed: "Your order has been confirmed",
  preparing: "Your order is being prepared",
  ready: "Your order is ready for pickup!",
  completed: "Order complete — enjoy!",
  cancelled: "Your order was cancelled",
};

// Three progress segments the customer sees: got it → cooking → ready.
// pending/confirmed light the first segment so the earliest, most anxious phase
// still shows movement (the live board itself mostly uses preparing/ready/done).
const PROGRESS_SEGMENTS = 3;
function progressIndex(status: OrderStatus): number {
  switch (status) {
    case "pending":
    case "confirmed":
      return 0;
    case "preparing":
      return 1;
    case "ready":
    case "completed":
      return 2;
    default:
      return -1; // cancelled — no progress
  }
}

export function OrderStatusPoller({
  boothId,
  orderNumber,
  token,
  initialStatus,
  boothName,
  placedAt,
}: Props) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  // null until known (avoids SSR/hydration mismatch); "default" = can ask.
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  // Alerts armed on this page: audio unlocked, and notifications requested where
  // supported. Tracked separately so iOS Safari (no Notification API) can still
  // arm sound + title-flash.
  const [armed, setArmed] = useState(false);
  const [requesting, setRequesting] = useState(false);
  // Client-only clock for the "placed N min ago" stamp. null until mounted so
  // the server and first client render agree (no hydration mismatch); ticks
  // each 30s so the stamp stays roughly current without a per-second timer.
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPermission(notifyPermission());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  async function onEnableAlerts() {
    setRequesting(true);
    // Unlock audio on this gesture (the only reliable moment on mobile), then
    // request notification permission where the API exists.
    unlockAudio();
    if (isNotifySupported()) {
      const result = await requestNotifyPermission();
      setPermission(result);
    }
    setArmed(true);
    setRequesting(false);
    // A confirming chime proves to the customer that sound is now on.
    void playReadyChime();
  }

  // Poll the status until it reaches a terminal state. Works on every browser
  // (no WebSocket dependency); the shared hook pauses while backgrounded and
  // refreshes the instant the tab returns.
  const poll = useCallback(async () => {
    const next = await getOrderStatus(boothId, orderNumber, token);
    if (next) setStatus(next);
  }, [boothId, orderNumber, token]);
  usePolling(poll, { intervalMs: POLL_MS, enabled: !isTerminal(status) });

  // Alert the moment the order flips to ready. setState bails on an identical
  // value, so this fires once per real transition, not every poll.
  useEffect(() => {
    if (status !== "ready") return;

    // System popup — reaches the customer even with the tab backgrounded
    // (where supported + granted); a no-op otherwise.
    void fireReadyNotification(
      boothName,
      orderNumber,
      // Keep the ?t=<token> query — the status page now requires it, so a
      // notification-tap that opens the page fresh must carry the token.
      window.location.pathname + window.location.search,
    );

    if (!document.hidden) {
      void playReadyChime();
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
      void playReadyChime();
      document.removeEventListener("visibilitychange", onVisible);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(flash);
      document.title = original;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, boothName, orderNumber]);

  const cancelled = status === "cancelled";
  const idx = progressIndex(status);
  const elapsed =
    nowMs != null ? elapsedLabel(nowMs - Date.parse(placedAt)) : null;

  // Offer to arm alerts while still waiting — moot once ready/done. Shown even
  // where notifications aren't supported (iOS Safari), because the tap is also
  // what unlocks sound. Hidden once armed or once permission is already granted.
  const waiting = status !== "ready" && !isTerminal(status);
  const canArm = waiting && !armed && permission !== "granted";
  const willNotify = waiting && (armed || permission === "granted");
  // Be honest about what they'll get: a system popup only where supported.
  const notifyWorks = isNotifySupported() && permission === "granted";

  return (
    <div className="space-y-5 px-6 py-6 text-center">
      <div className="flex justify-center">
        <OrderStatusBadge status={status} />
      </div>

      {!cancelled && (
        <div className="flex items-center gap-1.5">
          {Array.from({ length: PROGRESS_SEGMENTS }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= idx ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>
      )}

      {/* Live region: the status text is always mounted and only its text
          changes on poll, so a screen reader announces the transition (e.g.
          "ready for pickup") without a visual cue (SC 4.1.3). */}
      <p
        role="status"
        aria-live="polite"
        className={`font-display text-xl font-semibold ${
          status === "ready" ? "text-status-ready" : ""
        }`}
      >
        {STATUS_MESSAGE[status]}
      </p>

      {!cancelled && elapsed && (
        <p className="-mt-2 text-xs text-muted-foreground">Placed {elapsed}</p>
      )}

      {status === "ready" && (
        <p className="animate-pulse text-sm font-medium text-status-ready">
          Please collect your order now
        </p>
      )}

      {canArm && (
        <button
          type="button"
          onClick={onEnableAlerts}
          disabled={requesting}
          className="mx-auto flex items-center gap-2 rounded-full border border-primary/40 bg-primary/[0.04] px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
        >
          <Bell className="size-4" />
          {requesting ? "Just a sec…" : "Alert me when it's ready"}
        </button>
      )}

      {willNotify && (
        <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground">
          <BellRing className="size-3.5 text-primary" />
          {notifyWorks
            ? "We'll alert you the moment it's ready"
            : "We'll chime the moment it's ready — keep this tab open"}
        </p>
      )}
    </div>
  );
}
