"use client";

import { useEffect, useState } from "react";
import {
  getProofPhotoUrl,
  findDuplicateProofOrder,
} from "@/app/dashboard/proof-actions";

interface Props {
  orderId: string;
  expectedAmountCents: number;
}

interface OcrHint {
  amountMatch: boolean | null;
  recognizedText: string;
}

// Self-hosted under /public/tesseract (see that folder's own note) — never
// the default jsDelivr CDN, so the model's WASM/worker/traineddata assets
// stay same-origin under this app's CSP. corePath is a directory (not a
// single file): tesseract.js picks between its SIMD/non-SIMD LSTM builds at
// runtime, both of which live there.
const TESSERACT_ASSET_PATH = "/tesseract";

export function PaymentProofViewer({ orderId, expectedAmountCents }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [duplicateOrderNumber, setDuplicateOrderNumber] = useState<
    string | null
  >(null);
  const [ocrHint, setOcrHint] = useState<OcrHint | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [photoUrl, duplicate] = await Promise.all([
        getProofPhotoUrl(orderId),
        findDuplicateProofOrder(orderId),
      ]);
      if (cancelled) return;
      setUrl(photoUrl);
      setDuplicateOrderNumber(duplicate);
      if (!photoUrl) return;

      // OCR is a hint only -- any failure (worker init, recognition) just
      // leaves ocrHint unset rather than surfacing an error, since the
      // vendor's actual review action never depends on it.
      try {
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng", 1, {
          workerPath: `${TESSERACT_ASSET_PATH}/worker.min.js`,
          corePath: TESSERACT_ASSET_PATH,
          langPath: TESSERACT_ASSET_PATH,
          // tesseract.js defaults to spawning the worker from a blob: URL
          // (defaultOptions.workerBlobURL); this app's CSP has no
          // worker-src/child-src directive, so worker creation falls back to
          // script-src, which doesn't allow blob:. false makes it spawn a
          // plain `new Worker(workerPath)` instead -- workerPath is already
          // same-origin, so this needs no CSP change.
          workerBlobURL: false,
        });
        const { data } = await worker.recognize(photoUrl);
        await worker.terminate();
        if (cancelled) return;
        const amountMatch = data.text.includes(
          (expectedAmountCents / 100).toFixed(2),
        );
        setOcrHint({ amountMatch, recognizedText: data.text });
      } catch (error) {
        if (!cancelled) console.error("Payment proof OCR failed", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, expectedAmountCents]);

  if (!url) return null;

  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Payment proof" className="w-full rounded-lg" />
      {duplicateOrderNumber && (
        <p className="text-sm font-semibold text-destructive">
          This photo was already used for order #{duplicateOrderNumber}
        </p>
      )}
      {ocrHint && (
        <p className="text-sm text-muted-foreground">
          {ocrHint.amountMatch
            ? `Looks like $${(expectedAmountCents / 100).toFixed(2)}, paid`
            : "Couldn't confirm the amount, check manually"}
        </p>
      )}
    </div>
  );
}
