"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellRing,
  Check,
  ChefHat,
  ClipboardCheck,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/use-async-action";
import { toast } from "sonner";
import { usePolling } from "@/hooks/use-polling";
import { cn } from "@/lib/utils";
import {
  fireReadyNotification,
  isNotifySupported,
  notifyPermission,
  playReadyChime,
  requestNotifyPermission,
  unlockAudio,
} from "@/lib/order-alerts";
import {
  getOrderStatus,
  getWaitEstimate,
  confirmArrival,
} from "./status-actions";
import {
  elapsedLabel,
  estimateRangeLabel,
  isTerminal,
  orderStageIndex,
  queuePositionLabel,
  ORDER_STAGES,
  type OrderStage,
} from "@/lib/orders";
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
  // Shown in copy; may differ from orderNumber under daily-reset display.
  displayNumber: string;
  token: string;
  initialStatus: OrderStatus;
  boothName: string;
  // ISO created_at, for the "placed N min ago" stamp
  placedAt: string;
  // True while this order still expects payment and the vendor hasn't
  // confirmed receiving it yet — kitchen status and payment status advance
  // independently, so "preparing"/"ready" can be true before payment is.
  awaitingPayment: boolean;
  // Whether this booth waits for the customer's own "I'm here" tap. A
  // 'pending' order can also mean the vendor hasn't accepted it yet (no
  // printer connected, 0086) — that case shows no self-start button.
  requiresArrivalConfirm: boolean;
}

// What the page says at each status: a headline naming where things stand, and
// one line of what to do about it. Written as the stall talking ("we're making
// it"), not as a system reporting a field, and never more than the customer
// can act on right now.
const STATUS_COPY: Record<OrderStatus, { headline: string; detail: string }> = {
  pending: {
    headline: "We've got your order",
    detail: "The stall will start on it shortly.",
  },
  confirmed: {
    headline: "We've got your order",
    detail: "The stall will start on it shortly.",
  },
  preparing: {
    headline: "We're making it now",
    detail: "Stay close. This page turns to Ready the moment it is.",
  },
  ready: {
    headline: "It's ready",
    detail: "Come to the counter and collect it.",
  },
  completed: {
    headline: "Collected. Enjoy!",
    detail: "Thanks for ordering.",
  },
  cancelled: {
    headline: "This order was cancelled",
    detail: "Nothing more will happen with it.",
  },
};

// Overrides for the same statuses while payment is still outstanding — the
// kitchen may already be moving, but the text must not imply payment is
// settled when it isn't. "completed"/"cancelled" aren't listed: a completed
// order's payment auto-confirms, and a cancelled order never solicits
// payment (see order-status page's showPay gate).
const AWAITING_PAYMENT_COPY: Partial<
  Record<OrderStatus, { headline: string; detail: string }>
> = {
  confirmed: {
    headline: "Pay to start your order",
    detail: "The stall begins once your payment is in.",
  },
  preparing: {
    headline: "We're making it now",
    detail: "Please complete your payment while you wait.",
  },
  ready: {
    headline: "It's ready",
    detail: "Please pay before you collect.",
  },
};

const STAGE_LABEL: Record<OrderStage, string> = {
  received: "Received",
  preparing: "Preparing",
  ready: "Ready",
  collected: "Collected",
};

const STAGE_ICON: Record<OrderStage, typeof Check> = {
  received: ClipboardCheck,
  preparing: ChefHat,
  ready: BellRing,
  collected: ShoppingBag,
};

/**
 * The order's four stages on one line, all visible from the start so the
 * finish is in sight the whole wait. Stages already reached are filled; the
 * one the order is on carries the stage's own icon and a slow pulse; the rest
 * are outlines. "Received" is reached the moment the page loads, so the track
 * never opens empty: a wait that has visibly begun is easier to sit through
 * than one that looks like nothing has happened yet.
 */
function StageTrack({ status }: { status: OrderStatus }) {
  const current = orderStageIndex(status);
  return (
    <ol aria-label="Order progress" className="flex items-start">
      {ORDER_STAGES.map((stage, i) => {
        const reached = i <= current;
        const isCurrent = i === current;
        const Icon = i < current ? Check : STAGE_ICON[stage];
        return (
          <li
            key={stage}
            aria-current={isCurrent ? "step" : undefined}
            className="relative flex flex-1 flex-col items-center gap-2"
          >
            {/* The connector into this stage, drawn behind the node. */}
            {i > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-5 right-1/2 left-[-50%] h-0.5 -translate-y-1/2",
                  reached ? "bg-primary" : "bg-border",
                )}
              />
            )}
            <span className="relative z-10 flex size-10 items-center justify-center">
              {isCurrent && status !== "completed" && (
                <span
                  aria-hidden="true"
                  className="stage-pulse absolute inset-0 rounded-full bg-primary/35"
                />
              )}
              <span
                className={cn(
                  "relative flex size-10 items-center justify-center rounded-full border-2 transition-colors",
                  reached
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
            </span>
            <span
              className={cn(
                "text-xs leading-tight",
                isCurrent ? "font-bold text-foreground" : "font-medium",
                !reached && "text-muted-foreground",
              )}
            >
              {STAGE_LABEL[stage]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderStatusPoller({
  boothId,
  orderNumber,
  displayNumber,
  token,
  initialStatus,
  boothName,
  placedAt,
  awaitingPayment,
  requiresArrivalConfirm,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  // null = nothing to show at all (order not found — shouldn't happen once
  // mounted, but poll-only pages must tolerate a transient blip). Otherwise
  // seconds may itself be null (not enough recent history) while ordersAhead
  // is still known — the queue-position fallback covers that case instead of
  // showing nothing. Recomputed on the same poll as status, live not frozen.
  const [wait, setWait] = useState<{
    seconds: number | null;
    ordersAhead: number;
  } | null>(null);
  // null until known (avoids SSR/hydration mismatch); "default" = can ask.
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  // Alerts armed on this page: audio unlocked, and notifications requested where
  // supported. Tracked separately so iOS Safari (no Notification API) can still
  // arm sound + title-flash.
  const [armed, setArmed] = useState(false);
  const [requesting, setRequesting] = useState(false);
  // Client-only clock for the "placed N min ago" stamp. Kept bespoke rather than
  // useNow(): that seeds Date.now() in its initializer, which on this SSR'd page
  // would differ between server and client render (hydration mismatch). Starting
  // null and setting it in an effect makes the server and first client render
  // agree. Ticks each 30s (matches the minute-granular label); stops once the
  // order is terminal — a finished order's stamp no longer changes.
  const [nowMs, setNowMs] = useState<number | null>(null);

  const { pending: confirming, run: runConfirmArrival } = useAsyncAction();

  function onConfirmArrival() {
    return runConfirmArrival(async () => {
      const res = await confirmArrival(boothId, orderNumber, token);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setStatus("preparing");
    });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPermission(notifyPermission());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowMs(Date.now());
    if (isTerminal(status)) return;
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [status]);

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
    const [next, estimate] = await Promise.all([
      getOrderStatus(boothId, orderNumber, token),
      getWaitEstimate(boothId, orderNumber, token),
    ]);
    if (next && next !== status) {
      setStatus(next);
      // Pickup QR and completed-order content are rendered by the parent server page.
      router.refresh();
    }
    setWait(estimate);
  }, [boothId, orderNumber, token, status, router]);
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
  const ready = status === "ready";
  const elapsed =
    nowMs != null ? elapsedLabel(nowMs - Date.parse(placedAt)) : null;

  const waiting = !ready && !isTerminal(status);

  // A pending order at a booth that waits for the customer needs their tap to
  // start; a pending order waiting on the vendor's own accept (no printer,
  // 0086) has nothing for the customer to do.
  const needsArrival = status === "pending" && requiresArrivalConfirm;
  const copy = statusCopy(status, {
    needsArrival,
    awaitingPayment,
    displayNumber,
  });

  return (
    <div className="space-y-6 px-6 py-7 text-center">
      {!cancelled && <StageTrack status={status} />}

      {/* Ready takes over the block: it is the moment the whole page exists
          for, so it is the one state drawn in its own colour and at full
          size. */}
      <div
        className={cn(
          "space-y-1.5",
          ready &&
            "fade-rise rounded-2xl border-2 border-status-ready bg-status-ready/10 px-4 py-5",
        )}
      >
        {/* Live region: the status text is always mounted and only its text
            changes on poll, so a screen reader announces the transition (e.g.
            "It's ready") without a visual cue (SC 4.1.3). */}
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "font-display font-semibold text-balance",
            ready ? "text-3xl text-status-ready" : "text-2xl",
          )}
        >
          {copy.headline}
        </p>
        <p
          className={cn(
            "text-sm text-balance",
            ready ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {copy.detail}
        </p>
      </div>

      {needsArrival && (
        <Button
          type="button"
          size="lg"
          className="h-14 w-full rounded-xl text-base font-semibold"
          onClick={onConfirmArrival}
          disabled={confirming}
        >
          {confirming ? "Starting…" : "I'm here, start my order"}
        </Button>
      )}

      {waiting && !needsArrival && <WaitEstimate wait={wait} />}

      <ReadyAlerts
        waiting={waiting}
        armed={armed}
        permission={permission}
        requesting={requesting}
        onEnable={onEnableAlerts}
      />

      {!cancelled && elapsed && (
        <p className="text-xs text-muted-foreground">Placed {elapsed}</p>
      )}
    </div>
  );
}

type StatusCopy = { headline: string; detail: string };

/** The headline and the one line under it for where an order stands. */
function statusCopy(
  status: OrderStatus,
  {
    needsArrival,
    awaitingPayment,
    displayNumber,
  }: { needsArrival: boolean; awaitingPayment: boolean; displayNumber: string },
): StatusCopy {
  if (needsArrival)
    return {
      headline: "Tap when you're at the counter",
      detail: "We make it fresh, so we start once you arrive.",
    };
  if (awaitingPayment)
    return AWAITING_PAYMENT_COPY[status] ?? STATUS_COPY[status];
  if (status === "ready")
    return {
      headline: STATUS_COPY.ready.headline,
      detail: `Show order #${displayNumber} at the counter to collect it.`,
    };
  return STATUS_COPY[status];
}

// Range-based rather than a precise countdown: waiting-line research says
// uncertainty is what makes a wait feel worse, not the wait itself, so a
// visible-but-honest estimate beats hiding it or over-promising a single
// number. Falls back to queue position when there is not enough recent history
// for a time estimate yet.
function WaitEstimate({
  wait,
}: {
  wait: { seconds: number | null; ordersAhead: number } | null;
}) {
  if (!wait) return null;
  const timed = wait.seconds !== null;
  return (
    <div className="flex items-baseline justify-center gap-2 rounded-xl bg-primary/[0.06] px-5 py-3">
      {timed && <span className="text-sm text-muted-foreground">About</span>}
      <span className="font-display text-2xl font-bold text-primary">
        {wait.seconds !== null
          ? estimateRangeLabel(wait.seconds)
          : queuePositionLabel(wait.ordersAhead)}
      </span>
    </div>
  );
}

// The offer to be told when the order is ready, then the confirmation that it
// is armed. Offered even where notifications are not supported (iOS Safari),
// because the tap is also what unlocks sound; hidden once armed or once
// permission is already granted, and moot once the order is ready or done.
function ReadyAlerts({
  waiting,
  armed,
  permission,
  requesting,
  onEnable,
}: {
  waiting: boolean;
  armed: boolean;
  permission: NotificationPermission | null;
  requesting: boolean;
  onEnable: () => void;
}) {
  if (!waiting) return null;
  const granted = permission === "granted";
  if (!armed && !granted)
    return (
      <button
        type="button"
        onClick={onEnable}
        disabled={requesting}
        className="mx-auto flex min-h-11 items-center gap-2 rounded-full border border-primary/40 bg-primary/[0.04] px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
      >
        <Bell className="size-4" />
        {requesting ? "Just a sec…" : "Alert me when it's ready"}
      </button>
    );
  // Be honest about what they'll get: a system popup only where supported.
  const notifyWorks = isNotifySupported() && granted;
  return (
    <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground">
      <BellRing className="size-3.5 text-primary" />
      {notifyWorks
        ? "We'll alert you the moment it's ready"
        : "We'll chime the moment it's ready (keep this tab open)"}
    </p>
  );
}
