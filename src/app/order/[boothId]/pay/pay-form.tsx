"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import QRCode from "react-qr-code";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/utils";
import { paymentProofSchema } from "@/lib/schemas";
import { resizeToWebp } from "@merqo/ui";
import { useAsyncAction } from "@/hooks/use-async-action";
import { claimPayment } from "../[orderNumber]/payment-actions";
import { renderSvgToPngBlob } from "../[orderNumber]/qr-image";
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
  const qrWrapperRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  async function saveQrImage() {
    const svg = qrWrapperRef.current?.querySelector("svg");
    if (!svg) {
      toast.error("Couldn't prepare the QR to save.");
      return;
    }
    setSaving(true);
    try {
      const blob = await renderSvgToPngBlob(svg as SVGSVGElement);
      const file = new File([blob], "payment-qr.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
          // Share sheet failed for a non-cancel reason — fall through to download.
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "payment-qr.png";
      // Some browsers (historically Firefox) require the anchor to be in
      // the DOM for .click() to reliably trigger a download.
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Defer the revoke so it doesn't race with/cancel a download that's
      // still starting in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      toast.error("Couldn't prepare the QR to save. Screenshot it instead.");
    } finally {
      setSaving(false);
    }
  }

  async function onFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setPhotoError(null);
    // This is the only resize a payment proof gets: claimPayment is a server
    // action and cannot run the canvas-based resizeToWebp.
    const resized = await resizeToWebp(selected, 1600);
    const proof =
      resized.blob instanceof File
        ? resized.blob
        : new File([resized.blob], selected.name, {
            type: resized.type,
            lastModified: selected.lastModified,
          });
    // Same schema claimPayment enforces, checked here so an unsupported or
    // oversized file is rejected before the upload round trip.
    const checked = paymentProofSchema.safeParse(proof);
    if (!checked.success) {
      setPhoto(null);
      setPhotoError(
        checked.error.issues[0]?.message ?? "Invalid payment screenshot.",
      );
      return;
    }
    setPhoto(proof);
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

      {/* Hidden for a $0/unpriced order — nothing to echo. */}
      {amountCents > 0 && (
        <p className="text-center font-mono text-2xl font-bold">
          {formatPrice(amountCents)}
        </p>
      )}

      {checkout.type === "qr" && (
        <>
          <div
            ref={qrWrapperRef}
            className="mx-auto w-fit rounded-xl bg-white p-4"
          >
            <QRCode value={checkout.payload} size={220} />
          </div>
          <Button
            variant="outline"
            className="mx-auto flex h-10 w-fit items-center gap-2 rounded-xl"
            disabled={saving}
            onClick={saveQrImage}
          >
            <Download className="size-4" />
            Save QR image
          </Button>
          <p className="mx-auto max-w-xs text-center text-xs text-muted-foreground">
            On this phone? Save the QR, then open your banking app and scan it
            from your photos.
          </p>
        </>
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
