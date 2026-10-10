"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import QRCode from "react-qr-code";
import { Download, ImageUp } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ABANDONED_PAYMENT_MS } from "@/lib/orders";
import { cn, formatPrice } from "@/lib/utils";
import { paymentProofSchema } from "@/lib/schemas";
import { resizeToWebp } from "@merqo/ui";
import { useAsyncAction } from "@/hooks/use-async-action";
import { claimPayment } from "../[orderNumber]/payment-actions";
import { renderSvgToPngBlob } from "../[orderNumber]/qr-image";
import type { CheckoutView } from "@/lib/paykit/client";

const PAY_WINDOW_MINUTES = ABANDONED_PAYMENT_MS / 60_000;
const PROOF_ERROR_ID = "payment-proof-error";

interface Proof {
  file: File;
  // Null where the browser cannot make one; the file name still shows.
  previewUrl: string | null;
}

function previewUrlFor(file: File): string | null {
  return typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(file)
    : null;
}

function releasePreview(proof: Proof | null) {
  if (proof?.previewUrl) URL.revokeObjectURL(proof.previewUrl);
}

export function PayForm({
  boothId,
  token,
  boothName,
  items,
  amountCents,
  checkout,
}: {
  boothId: string;
  token: string;
  boothName: string;
  items: { name: string; quantity: number }[];
  amountCents: number;
  checkout: CheckoutView | null;
}) {
  const router = useRouter();
  const { pending: busy, run } = useAsyncAction();
  const [imgError, setImgError] = useState(false);
  const [proof, setProof] = useState<Proof | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const qrWrapperRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const proofRef = useRef<Proof | null>(null);

  function replaceProof(next: Proof | null) {
    releasePreview(proofRef.current);
    proofRef.current = next;
    setProof(next);
  }

  useEffect(() => () => releasePreview(proofRef.current), []);

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
    const file =
      resized.blob instanceof File
        ? resized.blob
        : new File([resized.blob], selected.name, {
            type: resized.type,
            lastModified: selected.lastModified,
          });
    // Same schema claimPayment enforces, checked here so an unsupported or
    // oversized file is rejected before the upload round trip.
    const checked = paymentProofSchema.safeParse(file);
    if (!checked.success) {
      replaceProof(null);
      setPhotoError(
        checked.error.issues[0]?.message ?? "Invalid payment screenshot.",
      );
      return;
    }
    replaceProof({ file, previewUrl: previewUrlFor(file) });
  }

  function submit() {
    if (!proof) {
      setPhotoError("A payment screenshot is required.");
      return;
    }
    return run(async () => {
      const res = await claimPayment(boothId, token, proof.file);
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

  // One filled button at a time, on the step the customer is up to: pay,
  // then attach the screenshot, then tell the stall.
  const payIsNext = checkout.type === "link" && !proof;
  const attachIsNext = checkout.type !== "link" && !proof;

  return (
    <section className="space-y-5 px-6 py-5">
      <header className="space-y-1 text-center">
        <h1 className="font-display text-xl font-semibold text-balance">
          {payHeading}
        </h1>
        <p className="text-sm text-muted-foreground">Order from {boothName}</p>
      </header>

      <div className="space-y-2 text-center">
        {/* Hidden for a $0/unpriced order — nothing to echo. */}
        {amountCents > 0 && (
          <p className="font-mono text-3xl font-bold">
            {formatPrice(amountCents)}
          </p>
        )}
        <ul className="space-y-0.5 text-sm text-muted-foreground">
          {items.map((item, index) => (
            <li key={`${item.name}-${index}`} className="break-words">
              {item.quantity}× {item.name}
            </li>
          ))}
        </ul>
      </div>

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
            className="mx-auto flex h-11 w-fit items-center gap-2 rounded-xl"
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
        <Button
          asChild
          variant={payIsNext ? "default" : "outline"}
          className="h-12 w-full rounded-xl"
        >
          <a href={checkout.url} target="_blank" rel="noopener noreferrer">
            {checkout.label}
          </a>
        </Button>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Pay within {PAY_WINDOW_MINUTES} minutes, or this order is cancelled.
      </p>

      <div className="space-y-2">
        {proof && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2">
            {proof.previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proof.previewUrl}
                alt=""
                className="h-14 w-11 shrink-0 rounded-md object-cover"
              />
            )}
            <div className="min-w-0 text-left">
              <p className="text-sm font-semibold">Screenshot attached</p>
              <p className="truncate text-xs text-muted-foreground">
                {proof.file.name}
              </p>
            </div>
          </div>
        )}
        {/* A real file input, hidden from sight and reached through its
            label, so the phone offers the photo library as well as the camera:
            a payment made on this phone is a saved screenshot. */}
        <input
          id="payment-proof"
          type="file"
          accept="image/*"
          onChange={onFileSelected}
          aria-invalid={photoError ? true : undefined}
          aria-describedby={photoError ? PROOF_ERROR_ID : undefined}
          className="peer sr-only"
        />
        <label
          htmlFor="payment-proof"
          className={cn(
            buttonVariants({ variant: attachIsNext ? "default" : "outline" }),
            "h-12 w-full cursor-pointer rounded-xl peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring",
          )}
        >
          <ImageUp className="size-4" aria-hidden />
          {proof
            ? "Upload a different screenshot"
            : "Upload payment screenshot"}
        </label>
        {photoError && (
          <p
            id={PROOF_ERROR_ID}
            role="alert"
            className="text-center text-sm font-medium text-destructive"
          >
            {photoError}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Button
          variant={proof ? "default" : "outline"}
          className="h-12 w-full rounded-xl"
          disabled={busy}
          onClick={submit}
        >
          I&apos;ve paid
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          The stall checks your screenshot. Your order number comes next.
        </p>
      </div>

      <Link
        href={`/order/${boothId}`}
        className="mx-auto flex min-h-11 w-fit items-center text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Back to the menu
      </Link>
    </section>
  );
}
