"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/image-uploader";
import { cn, FORM_LABEL_CLASS } from "@/lib/utils";
import type { PaymentConfig } from "@/lib/types";

type Kind = "none" | "pointer" | "paynow";

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

  function pick(next: Kind) {
    if (next === "none") onChange(null);
    else if (next === "paynow")
      onChange({ kind: "paynow", payee_name: "", uen: "" });
    else onChange({ kind: "pointer", label: "", url: "" });
  }

  return (
    <fieldset className="space-y-4">
      <div className="space-y-1">
        <legend className="font-display text-lg font-semibold">Payments</legend>
        <p className="text-sm text-muted-foreground">
          Optional. Attach your own payment method, customers pay you directly;
          QKit never touches the money.
        </p>
      </div>

      {/* Radio cards: a small, comparable set, so show every option at once
          (a dropdown would hide them and add a click). */}
      <div className="space-y-2.5">
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
              <input
                type="radio"
                name="payment-kind"
                checked={selected}
                onChange={() => pick(k)}
                aria-label={label}
                className="mt-0.5 size-4 accent-[var(--color-primary)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">
                  {hint}
                </span>
              </span>
            </label>
          );
        })}
      </div>

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
                  qr_image_url: pointer?.qr_image_url,
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
                  qr_image_url: pointer?.qr_image_url,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Any https link: a Qashier/HitPay/GrabPay checkout, your
              bank&apos;s payment page, or a Stripe Payment Link.
            </p>
          </div>
          <div className="space-y-2">
            <Label className={FORM_LABEL_CLASS}>Or a QR image</Label>
            <ImageUploader
              vendorId={vendorId}
              variant="thumb"
              value={pointer?.qr_image_url ?? null}
              onChange={(url) =>
                onChange({
                  kind: "pointer",
                  label: pointer?.label ?? "",
                  url: pointer?.url,
                  qr_image_url: url ?? undefined,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              A static QR you already have: your GrabPay, PayLah, or bank QR
              code, photographed or screenshotted. Shown if no payment link is
              set above.
            </p>
          </div>
        </div>
      )}
    </fieldset>
  );
}
