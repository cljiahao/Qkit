"use client";

import { useState } from "react";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CheckoutView } from "@/lib/payments/adapters";
import type { PaymentStatus } from "@/lib/types";
import { claimPayment } from "./payment-actions";

export function PayPanel({
  boothId,
  orderNumber,
  checkout,
  initialStatus,
}: {
  boothId: string;
  orderNumber: string;
  checkout: CheckoutView;
  initialStatus: PaymentStatus;
}) {
  const [status, setStatus] = useState<PaymentStatus>(initialStatus);
  const [busy, setBusy] = useState(false);

  // Once the vendor has confirmed receipt there's nothing left to pay.
  if (status === "confirmed" || status === "not_required") return null;

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
        {checkout.type === "link" ? "Pay to collect" : "Scan to pay"}
      </p>

      {checkout.type === "qr" && (
        <div className="mx-auto w-fit rounded-xl bg-white p-4">
          <QRCode value={checkout.payload} size={180} />
        </div>
      )}
      {checkout.type === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={checkout.url}
          alt="Payment QR"
          className="mx-auto w-44 rounded-xl border border-border"
        />
      )}
      {checkout.type === "link" && (
        <Button asChild className="h-12 w-full rounded-xl">
          <a href={checkout.url} target="_blank" rel="noopener noreferrer">
            {checkout.label}
          </a>
        </Button>
      )}

      {claimed ? (
        <p className="text-center text-sm font-semibold text-emerald-600">
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
