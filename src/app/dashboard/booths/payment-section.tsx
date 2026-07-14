"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ImageUploader } from "@/components/image-uploader";
import { cn, FORM_LABEL_CLASS } from "@/lib/utils";
import type { PaymentConfig } from "@/lib/types";

type Kind = "none" | "pointer" | "paynow";
type PointerMode = "link" | "qr";

function kindOf(v: PaymentConfig | null): Kind {
  if (!v) return "none";
  // 'stripe' is reserved-but-dark — surface it as "none" in the editor.
  return v.kind === "stripe" ? "none" : v.kind;
}

// Each option carries a one-line, plain-language hint so a vendor can pick at a
// glance without reading docs.
const OPTIONS: { k: Kind; label: string; hint: string }[] = [
  {
    k: "none",
    label: "No online payment",
    hint: "Customers just join the queue and settle up at the counter.",
  },
  {
    k: "paynow",
    label: "PayNow QR",
    hint: "We generate a QR with the order amount already filled in.",
  },
  {
    k: "pointer",
    label: "Payment link or QR image",
    hint: "Qashier, HitPay, GrabPay for Business, Stripe Payment Links, or your bank's own QR: any of them work here.",
  },
];

export function PaymentSection({
  vendorId,
  value,
  onChange,
}: {
  vendorId: string;
  value: PaymentConfig | null;
  onChange: (next: PaymentConfig | null) => void;
}) {
  const kind = kindOf(value);
  const paynow = value?.kind === "paynow" ? value : null;
  const pointer = value?.kind === "pointer" ? value : null;

  // Which pointer field is live. A vendor can only ever use one at a time
  // (renderCheckout picks url over qr_image_url when both happen to be set),
  // so the editor shows exactly one instead of both plus a footnote about
  // which one wins.
  const [pointerMode, setPointerMode] = useState<PointerMode>(() =>
    pointer?.qr_image_url && !pointer?.url ? "qr" : "link",
  );

  function pick(next: Kind) {
    if (next === "none") onChange(null);
    else if (next === "paynow")
      onChange({ kind: "paynow", payee_name: "", uen: "" });
    else {
      setPointerMode("link");
      onChange({ kind: "pointer", label: "", url: "" });
    }
  }

  function pickPointerMode(next: PointerMode) {
    setPointerMode(next);
    // Clear the field for the mode being left, so the data never carries
    // stale url + qr_image_url at once.
    onChange({
      kind: "pointer",
      label: pointer?.label ?? "",
      url: next === "link" ? pointer?.url : undefined,
      qr_image_url: next === "qr" ? pointer?.qr_image_url : undefined,
    });
  }

  return (
    <div className="space-y-4">
      {/* Radio cards: a small, comparable set, so show every option at once
          (a dropdown would hide them and add a click). */}
      <RadioGroup
        value={kind}
        onValueChange={(v) => pick(v as Kind)}
        className="gap-2.5"
      >
        {OPTIONS.map(({ k, label, hint }) => {
          const selected = kind === k;
          return (
            <label
              key={k}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors",
                selected
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border bg-card hover:bg-secondary/50",
              )}
            >
              <RadioGroupItem value={k} aria-label={label} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">
                  {hint}
                </span>
              </span>
            </label>
          );
        })}
      </RadioGroup>

      {kind === "paynow" && (
        <div className="space-y-4 rounded-xl border border-border bg-card/40 p-4">
          <div className="space-y-2">
            <Label htmlFor="pn-name" className={FORM_LABEL_CLASS}>
              Payee name
            </Label>
            <Input
              id="pn-name"
              value={paynow?.payee_name ?? ""}
              placeholder="Kopitiam Cart"
              className="h-12 rounded-xl"
              onChange={(e) =>
                onChange({
                  kind: "paynow",
                  payee_name: e.target.value,
                  uen: paynow?.uen,
                  mobile: paynow?.mobile,
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pn-uen" className={FORM_LABEL_CLASS}>
              UEN
            </Label>
            <Input
              id="pn-uen"
              value={paynow?.uen ?? ""}
              placeholder="53312345A"
              className="h-12 rounded-xl"
              onChange={(e) =>
                onChange({
                  kind: "paynow",
                  payee_name: paynow?.payee_name ?? "",
                  uen: e.target.value || undefined,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Your business PayNow UEN. Customers scan a QR with the order total
              already filled in.
            </p>
          </div>
        </div>
      )}

      {kind === "pointer" && (
        <div className="space-y-4 rounded-xl border border-border bg-card/40 p-4">
          <ToggleGroup
            type="single"
            value={pointerMode}
            onValueChange={(v) => v && pickPointerMode(v as PointerMode)}
            aria-label="Payment link or QR image"
            className="inline-flex rounded-lg border border-border p-0.5 text-sm"
          >
            {(
              [
                { m: "link", label: "Payment link" },
                { m: "qr", label: "QR image" },
              ] as const
            ).map(({ m, label }) => (
              <ToggleGroupItem
                key={m}
                value={m}
                className="rounded-md px-3 py-1 font-medium text-muted-foreground data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
              >
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {pointerMode === "link" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="pt-label" className={FORM_LABEL_CLASS}>
                  Button label
                </Label>
                <Input
                  id="pt-label"
                  value={pointer?.label ?? ""}
                  placeholder="Pay with PayLah"
                  className="h-12 rounded-xl"
                  onChange={(e) =>
                    onChange({
                      kind: "pointer",
                      label: e.target.value,
                      url: pointer?.url,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pt-url" className={FORM_LABEL_CLASS}>
                  Payment link
                </Label>
                <Input
                  id="pt-url"
                  value={pointer?.url ?? ""}
                  placeholder="https://…"
                  className="h-12 rounded-xl"
                  onChange={(e) =>
                    onChange({
                      kind: "pointer",
                      label: pointer?.label ?? "",
                      url: e.target.value || undefined,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Any https link: a Qashier/HitPay/GrabPay checkout, your
                  bank&apos;s payment page, or a Stripe Payment Link.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label className={FORM_LABEL_CLASS}>QR image</Label>
              <ImageUploader
                vendorId={vendorId}
                variant="thumb"
                value={pointer?.qr_image_url ?? null}
                onChange={(url) =>
                  onChange({
                    kind: "pointer",
                    label: pointer?.label ?? "",
                    qr_image_url: url ?? undefined,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                A static QR you already have: your GrabPay, PayLah, or bank QR
                code, photographed or screenshotted.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
