"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import QRCode from "react-qr-code";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/utils";
import { resizeToWebp } from "@/lib/image-resize";
import { useAsyncAction } from "@/hooks/use-async-action";
import { claimPayment } from "../[orderNumber]/payment-actions";
import type { CheckoutView } from "@/lib/paykit/client";

export function PayForm({
  boothId,
  token,
  amountCents,
  checkout,
}: {
  boothId: string;
  token: string;
  amountCents: number;
  checkout: CheckoutView | null;
}) {
  const router = useRouter();
  const { pending: busy, run } = useAsyncAction();
  const [imgError, setImgError] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function onFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setPhotoError(null);
    // Shrink before the round-trip to the server action — claimPayment
    // resizes again server-side, but a slow mobile upload benefits from not
    // sending the full-size original over the wire in the first place.
    const resized = await resizeToWebp(selected, 1600);
    setPhoto(
      resized.blob instanceof File
        ? resized.blob
        : new File([resized.blob], selected.name, {
            type: resized.type,
            lastModified: selected.lastModified,
          }),
    );
  }

  function submit() {
    if (!photo) {
      setPhotoError("A payment screenshot is required.");
      return;
    }
    return run(async () => {
      const res = await claimPayment(boothId, token, photo);
      if (res.success)
        router.push(`/order/${boothId}/${res.orderNumber}?t=${token}`);
      else toast.error(res.error);
    });
  }

  if (!checkout) {
    return (
      <section className="space-y-3 px-6 py-5 text-center">
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load payment right now. Refresh the page, or ask the
          stall for help.
        </p>
        <Button variant="outline" onClick={() => router.refresh()}>
          Refresh
        </Button>
      </section>
    );
  }

  let payHeading: string;
  if (checkout.type === "link") payHeading = "Pay to collect";
  else if (checkout.type === "qr")
    payHeading = "Scan with your PayNow banking app to pay";
  else payHeading = "Scan with your banking or payment app to pay";

  return (
    <section className="space-y-4 px-6 py-5">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        {payHeading}
      </p>

      {/* Echo the amount so the customer keys the right sum (and can sanity-check
          a dynamic PayNow QR). Hidden for a $0 / unpriced order. */}
      {amountCents > 0 && (
        <p className="text-center font-mono text-2xl font-bold">
          {formatPrice(amountCents)}
        </p>
      )}

      {checkout.type === "qr" && (
        <div className="mx-auto w-fit rounded-xl bg-white p-4">
          <QRCode value={checkout.payload} size={220} />
        </div>
      )}
      {checkout.type === "image" &&
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
      {checkout.type === "link" && (
        <Button asChild className="h-12 w-full rounded-xl">
          <a href={checkout.url} target="_blank" rel="noopener noreferrer">
            {checkout.label}
          </a>
        </Button>
      )}

      <div className="space-y-2">
        <Label htmlFor="payment-proof">Upload payment screenshot</Label>
        <Input
          id="payment-proof"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFileSelected}
        />
        {photoError && (
          <p className="text-center text-xs font-medium text-destructive">
            {photoError}
          </p>
        )}
      </div>

      <Button
        variant="outline"
        className="h-11 w-full rounded-xl"
        disabled={busy}
        onClick={submit}
      >
        I&apos;ve paid
      </Button>
    </section>
  );
}
