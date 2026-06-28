"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { PaymentConfig } from "@/lib/types";

type Kind = "none" | "pointer" | "paynow";

function kindOf(v: PaymentConfig | null): Kind {
  if (!v) return "none";
  // 'stripe' is reserved-but-dark — surface it as "none" in the editor.
  return v.kind === "stripe" ? "none" : v.kind;
}

export function PaymentSection({
  value,
  onChange,
}: {
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
      <legend className="font-display text-lg font-semibold">Payments</legend>
      <p className="text-sm text-muted-foreground">
        Optional. Attach your own payment method — customers pay you directly;
        QKit never touches the money.
      </p>

      <div className="space-y-2">
        {(
          [
            ["none", "No online payment"],
            ["paynow", "PayNow QR"],
            ["pointer", "Payment link / QR image"],
          ] as [Kind, string][]
        ).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="payment-kind"
              checked={kind === k}
              onChange={() => pick(k)}
              aria-label={label}
            />
            {label}
          </label>
        ))}
      </div>

      {kind === "paynow" && (
        <div className="space-y-3">
          <div>
            <Label htmlFor="pn-name">Payee name</Label>
            <Input
              id="pn-name"
              value={paynow?.payee_name ?? ""}
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
          <div>
            <Label htmlFor="pn-uen">UEN</Label>
            <Input
              id="pn-uen"
              value={paynow?.uen ?? ""}
              onChange={(e) =>
                onChange({
                  kind: "paynow",
                  payee_name: paynow?.payee_name ?? "",
                  uen: e.target.value || undefined,
                })
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Your PayNow UEN — customers scan a QR with the order amount filled
            in.
          </p>
        </div>
      )}

      {kind === "pointer" && (
        <div className="space-y-3">
          <div>
            <Label htmlFor="pt-label">Button label</Label>
            <Input
              id="pt-label"
              value={pointer?.label ?? ""}
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
          <div>
            <Label htmlFor="pt-url">Payment link</Label>
            <Input
              id="pt-url"
              value={pointer?.url ?? ""}
              onChange={(e) =>
                onChange({
                  kind: "pointer",
                  label: pointer?.label ?? "",
                  url: e.target.value || undefined,
                  qr_image_url: pointer?.qr_image_url,
                })
              }
            />
          </div>
        </div>
      )}
    </fieldset>
  );
}
