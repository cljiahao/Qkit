"use client";

import { useCallback, useState } from "react";
import QRCode from "react-qr-code";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import type { CheckoutView } from "@/lib/payments/adapters";
import type { PaymentStatus } from "@/lib/types";
import { usePolling } from "@/hooks/use-polling";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
  claimPayment,
  getPaymentStatus,
  unclaimPayment,
} from "./payment-actions";

const POLL_MS = 5000;

export function PayPanel({
  boothId,
  orderNumber,
  token,
  checkout,
  initialStatus,
  amountCents,
}: {
  boothId: string;
  orderNumber: string;
  token: string;
  checkout: CheckoutView | null;
  initialStatus: PaymentStatus;
  amountCents: number;
}) {
  const [status, setStatus] = useState<PaymentStatus>(initialStatus);
  const { pending: busy, run } = useAsyncAction();
  const [imgError, setImgError] = useState(false);

  // Poll until the vendor confirms (terminal for payment), so a "Confirm
  // payment" tap on the board reflects on the customer's page — same poll-only
  // approach the order-status poller uses (realtime is flaky on customer
  // devices). The shared hook pauses while the tab is hidden.
  const poll = useCallback(async () => {
    const next = await getPaymentStatus(boothId, orderNumber, token);
    if (next) setStatus(next);
  }, [boothId, orderNumber, token]);
  usePolling(poll, {
    intervalMs: POLL_MS,
    enabled: status !== "confirmed" && status !== "not_required",
  });

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

  function claim() {
    return run(async () => {
      const res = await claimPayment(boothId, orderNumber, token);
      if (res.success) setStatus("claimed");
      else toast.error(res.error);
    });
  }

  function unclaim() {
    return run(async () => {
      const res = await unclaimPayment(boothId, orderNumber, token);
      if (res.success) setStatus("pending");
      else toast.error(res.error);
    });
  }

  const claimed = status === "claimed";

  return (
    <section className="space-y-4 px-6 py-5">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        {checkout?.type === "link"
          ? "Pay to collect"
          : checkout?.type === "qr"
            ? "Scan with your PayNow banking app to pay"
            : "Scan with your banking or payment app to pay"}
      </p>

      {/* Echo the amount so the customer keys the right sum (and can sanity-check
          a dynamic PayNow QR). Hidden for a $0 / unpriced order. */}
      {amountCents > 0 && (
        <p className="text-center font-mono text-2xl font-bold">
          {formatPrice(amountCents)}
        </p>
      )}

      {checkout?.type === "qr" && (
        <div className="mx-auto w-fit rounded-xl bg-white p-4">
          <QRCode value={checkout.payload} size={180} />
        </div>
      )}
      {checkout?.type === "image" &&
        (imgError ? (
          <p className="mx-auto max-w-xs text-center text-sm text-muted-foreground">
            The payment QR couldn&apos;t load. Check your connection and
            refresh, or ask the stall to show its QR.
          </p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={checkout.url}
            alt="Payment QR"
            onError={() => setImgError(true)}
            className="mx-auto w-44 rounded-xl border border-border"
          />
        ))}
      {checkout?.type === "link" && (
        <Button asChild className="h-12 w-full rounded-xl">
          <a href={checkout.url} target="_blank" rel="noopener noreferrer">
            {checkout.label}
          </a>
        </Button>
      )}

      {claimed ? (
        <div className="space-y-2 text-center">
          <p
            role="status"
            aria-live="polite"
            className="text-sm font-semibold text-amber-600"
          >
            Payment sent, waiting for the stall to confirm.
          </p>
          <button
            type="button"
            onClick={unclaim}
            disabled={busy}
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60"
          >
            Tapped by mistake? Undo
          </button>
        </div>
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
