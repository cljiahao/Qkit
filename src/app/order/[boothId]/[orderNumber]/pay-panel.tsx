"use client";

import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CheckoutView } from "@/lib/payments/adapters";
import type { PaymentStatus } from "@/lib/types";
import { claimPayment, getPaymentStatus } from "./payment-actions";

const POLL_MS = 5000;

export function PayPanel({
  boothId,
  orderNumber,
  checkout,
  initialStatus,
}: {
  boothId: string;
  orderNumber: string;
  checkout: CheckoutView | null;
  initialStatus: PaymentStatus;
}) {
  const [status, setStatus] = useState<PaymentStatus>(initialStatus);
  const [busy, setBusy] = useState(false);

  // Poll until the vendor confirms (terminal for payment), so a "Confirm
  // payment" tap on the board reflects on the customer's page — same poll-only
  // approach the order-status poller uses (realtime is flaky on customer
  // devices). Pauses while the tab is hidden.
  useEffect(() => {
    if (status === "confirmed" || status === "not_required") return;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function tick() {
      if (document.hidden) return;
      const next = await getPaymentStatus(boothId, orderNumber);
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
      if (document.hidden) stop();
      else {
        void tick();
        start();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) {
      void tick();
      start();
    }
    return () => {
      stopped = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [boothId, orderNumber, status]);

  if (status === "not_required") return null;

  // Vendor confirmed receipt — show a clear, persistent paid state.
  if (status === "confirmed") {
    return (
      <section
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-2 px-6 py-6 text-center"
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
          <Check className="size-6" />
        </span>
        <p className="font-display text-lg font-semibold text-emerald-600">
          Payment confirmed
        </p>
        <p className="text-sm text-muted-foreground">
          The stall has confirmed your payment.
        </p>
      </section>
    );
  }

  async function claim() {
    setBusy(true);
    const res = await claimPayment(boothId, orderNumber);
    setBusy(false);
    if (res.success) setStatus("claimed");
    else toast.error(res.error);
  }

  const claimed = status === "claimed";

  return (
    <section className="space-y-4 px-6 py-5">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        {checkout?.type === "link" ? "Pay to collect" : "Scan to pay"}
      </p>

      {checkout?.type === "qr" && (
        <div className="mx-auto w-fit rounded-xl bg-white p-4">
          <QRCode value={checkout.payload} size={180} />
        </div>
      )}
      {checkout?.type === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={checkout.url}
          alt="Payment QR"
          className="mx-auto w-44 rounded-xl border border-border"
        />
      )}
      {checkout?.type === "link" && (
        <Button asChild className="h-12 w-full rounded-xl">
          <a href={checkout.url} target="_blank" rel="noopener noreferrer">
            {checkout.label}
          </a>
        </Button>
      )}

      {claimed ? (
        <p
          role="status"
          aria-live="polite"
          className="text-center text-sm font-semibold text-amber-600"
        >
          Payment sent — waiting for the stall to confirm.
        </p>
      ) : (
        <Button
          variant="outline"
          className="h-11 w-full rounded-xl"
          disabled={busy}
          onClick={claim}
        >
          I&apos;ve paid
        </Button>
      )}
    </section>
  );
}
