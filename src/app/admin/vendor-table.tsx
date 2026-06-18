"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setVendorPlan, grantPass } from "./actions";
import type { Plan } from "@/lib/types";

export type AdminVendorRow = {
  id: string;
  name: string;
  plan: Plan;
  created_at: string;
  // Most-recent live license expiry (ISO) or null — set by the admin page.
  passExpiresAt?: string | null;
};

const DURATIONS = [
  { label: "24h", hours: 24 },
  { label: "48h", hours: 48 },
  { label: "72h", hours: 72 },
];

function hoursLeft(iso: string, nowMs: number): number {
  return Math.max(0, Math.round((Date.parse(iso) - nowMs) / 3_600_000));
}

export function VendorTable({ vendors }: { vendors: AdminVendorRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [granting, setGranting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState(""); // $ collected; blank = free comp
  // Snapshot once (lazy init avoids an impure Date.now() during render).
  const [now] = useState(() => Date.now());

  // Shared by grant + make-pro: parse the $ field to cents (blank/invalid = 0 = comp).
  function parseAmountCents(): number {
    const dollars = Number(amount.trim());
    return amount.trim() && !Number.isNaN(dollars) && dollars >= 0
      ? Math.round(dollars * 100)
      : 0;
  }

  function reset() {
    setGranting(null);
    setNote("");
    setAmount("");
  }

  function flip(v: AdminVendorRow) {
    const next: Plan = v.plan === "pro" ? "free" : "pro";
    const amountCents = parseAmountCents();
    startTransition(async () => {
      const res = await setVendorPlan({
        vendorId: v.id,
        plan: next,
        amountCents,
        note: note.trim() || undefined,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `${v.name} → ${next}${next === "pro" && amountCents ? ` · $${(amountCents / 100).toFixed(2)}` : ""}`,
      );
      reset();
      router.refresh();
    });
  }

  function grant(v: AdminVendorRow, hours: number) {
    const amountCents = parseAmountCents();
    startTransition(async () => {
      const res = await grantPass({
        vendorId: v.id,
        durationHours: hours,
        note: note.trim() || undefined,
        amountCents,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `${v.name} → ${hours}h pass${amountCents ? ` · $${(amountCents / 100).toFixed(2)}` : " · free"}`,
      );
      reset();
      router.refresh();
    });
  }

  if (vendors.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        No vendors yet.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {vendors.map((v) => {
        const livePass =
          v.passExpiresAt && Date.parse(v.passExpiresAt) > now
            ? v.passExpiresAt
            : null;
        return (
          <div key={v.id} className="border-t border-border first:border-t-0">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{v.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {v.created_at.slice(0, 10)}
                </p>
              </div>
              {livePass && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                  <Ticket className="size-3" />
                  Pass · {hoursLeft(livePass, now)}h
                </span>
              )}
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  v.plan === "pro"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {v.plan}
              </span>
              <Button
                size="sm"
                variant={granting === v.id ? "default" : "outline"}
                className="rounded-lg"
                disabled={pending}
                onClick={() =>
                  granting === v.id ? reset() : setGranting(v.id)
                }
              >
                Manage
              </Button>
            </div>

            {granting === v.id && (
              <div className="space-y-3 border-t border-dashed border-border bg-muted/30 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    placeholder="Payment note (e.g. PayNow ref)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="h-9 max-w-[16rem] flex-1 rounded-lg text-sm"
                  />
                  <div className="relative w-28">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      $
                    </span>
                    <Input
                      inputMode="decimal"
                      placeholder="0 = free"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="h-9 rounded-lg pl-7 text-sm"
                      title="What you collected (blank/0 = free comp)"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                    <Ticket className="size-3.5" /> Pass:
                  </span>
                  {DURATIONS.map((d) => (
                    <Button
                      key={d.hours}
                      size="sm"
                      className="rounded-lg"
                      disabled={pending}
                      onClick={() => grant(v, d.hours)}
                    >
                      {d.label}
                    </Button>
                  ))}
                  <span className="mx-1 h-5 w-px bg-border" />
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg"
                    disabled={pending}
                    onClick={() => flip(v)}
                  >
                    {v.plan === "pro" ? (
                      "Downgrade"
                    ) : (
                      <>
                        <Sparkles className="size-3.5" /> Make Pro
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Amount records to revenue (pass or subscription). Blank/0 =
                  free comp — access granted, no revenue logged.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
