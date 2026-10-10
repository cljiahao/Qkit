"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import type { PaymentStatus } from "@/lib/types";
import { usePolling } from "@/hooks/use-polling";
import { useAsyncAction } from "@/hooks/use-async-action";
import { unclaimPayment, getPaymentStatus } from "./payment-actions";

const POLL_MS = 5000;

export function PayPanel({
  boothId,
  orderNumber,
  token,
  initialStatus,
}: {
  boothId: string;
  orderNumber: string;
  token: string;
  initialStatus: PaymentStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<PaymentStatus>(initialStatus);
  const { pending: busy, run } = useAsyncAction();

  // Poll until the vendor confirms (terminal for payment), so a "Confirm
  // payment" tap on the board reflects on the customer's page — same poll-only
  // approach the order-status poller uses (realtime is flaky on customer
  // devices). The shared hook pauses while the tab is hidden.
  const poll = useCallback(async () => {
    const next = await getPaymentStatus(boothId, orderNumber, token);
    if (next && next !== status) {
      setStatus(next);
      if (next === "pending")
        router.replace(`/order/${boothId}/pay?t=${token}`);
      else router.refresh();
    }
  }, [boothId, orderNumber, token, status, router]);
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

  function unclaim() {
    return run(async () => {
      const res = await unclaimPayment(boothId, orderNumber, token);
      if (res.success) {
        setStatus("pending");
        router.replace(`/order/${boothId}/pay?t=${token}`);
      } else toast.error(res.error);
    });
  }

  // The redirect guard on page.tsx sends a still-"pending" order to /pay
  // instead of rendering here, so "claimed" is the only non-terminal status
  // this component ever needs to render past the early returns above.
  if (status === "claimed") {
    return (
      <section className="space-y-4 px-6 py-5">
        <div className="space-y-2 text-center">
          <p
            role="status"
            aria-live="polite"
            className="text-sm font-semibold text-amber-600 dark:text-amber-400"
          >
            Payment sent. The stall is checking it.
          </p>
          <button
            type="button"
            onClick={unclaim}
            disabled={busy}
            className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-60"
          >
            Tapped by mistake? Undo
          </button>
        </div>
      </section>
    );
  }

  return null;
}
