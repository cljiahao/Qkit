"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPricing } from "./actions";

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(value: string): number | null {
  const n = Number(value.trim());
  if (Number.isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Admin-editable prices shown on the vendor offer page. */
export function PricingForm({
  initial,
}: {
  initial: {
    event_pass_cents: number;
    monthly_cents: number;
    currency: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [eventPass, setEventPass] = useState(
    centsToDollars(initial.event_pass_cents),
  );
  const [monthly, setMonthly] = useState(centsToDollars(initial.monthly_cents));

  function onSave() {
    const event_pass_cents = dollarsToCents(eventPass);
    const monthly_cents = dollarsToCents(monthly);
    if (event_pass_cents === null || monthly_cents === null) {
      toast.error("Enter valid prices");
      return;
    }
    startTransition(async () => {
      const res = await setPricing({ event_pass_cents, monthly_cents });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("Pricing updated");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Event pass ({initial.currency})
          </Label>
          <div className="relative w-32">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <Input
              inputMode="decimal"
              value={eventPass}
              onChange={(e) => setEventPass(e.target.value)}
              className="rounded-lg pl-7"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Monthly ({initial.currency})
          </Label>
          <div className="relative w-32">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <Input
              inputMode="decimal"
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
              className="rounded-lg pl-7"
            />
          </div>
        </div>
        <Button
          type="button"
          className="rounded-lg"
          onClick={onSave}
          disabled={pending}
        >
          {pending ? "Saving…" : "Save prices"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Shown on the vendor plan page. Payment is collected out-of-band (PayNow
        / cash); grant a pass below once paid.
      </p>
    </div>
  );
}
