"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Paginated } from "@/components/paginated";
import { centsToDollarString, parseDollarsToCents } from "@/lib/utils";
import { setVendorPlan, grantPass, revokePass } from "./actions";
import type { Plan } from "@/lib/types";

export type AdminVendorRow = {
  id: string;
  name: string;
  plan: Plan;
  created_at: string;
  // Most-recent live license expiry (ISO) or null — set by the admin page.
  passExpiresAt?: string | null;
};

function hoursLeft(iso: string, nowMs: number): number {
  return Math.max(0, Math.round((Date.parse(iso) - nowMs) / 3_600_000));
}

export function VendorTable({ vendors }: { vendors: AdminVendorRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [granting, setGranting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState(""); // $ collected; blank = free comp
  const [startDate, setStartDate] = useState(""); // "YYYY-MM-DD"; blank = now
  const [days, setDays] = useState("1");
  // Snapshot once (lazy init avoids an impure Date.now() during render).
  const [now] = useState(() => Date.now());

  // Shared by grant + make-pro: parse the $ field to cents (blank/invalid = 0 = comp).
  function parseAmountCents(): number {
    const r = parseDollarsToCents(amount);
    return r.ok && r.cents !== undefined ? r.cents : 0;
  }

  function reset() {
    setGranting(null);
    setNote("");
    setAmount("");
    setStartDate("");
    setDays("1");
  }

  // A date-only input is local midnight; toISOString gives the start instant.
  function startIso(): string | undefined {
    if (!startDate) return undefined;
    const ms = Date.parse(startDate);
    return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
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
        `${v.name} → ${next}${next === "pro" && amountCents ? ` · $${centsToDollarString(amountCents)}` : ""}`,
      );
      reset();
      router.refresh();
    });
  }

  function grant(v: AdminVendorRow, days: number) {
    const amountCents = parseAmountCents();
    startTransition(async () => {
      const res = await grantPass({
        vendorId: v.id,
        days,
        validFromIso: startIso(),
        note: note.trim() || undefined,
        amountCents,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      const when = startDate ? ` from ${startDate}` : "";
      toast.success(
        `${v.name} → ${days}-day pass${when}${amountCents ? ` · $${centsToDollarString(amountCents)}` : " · free"}`,
      );
      reset();
      router.refresh();
    });
  }

  function revoke(v: AdminVendorRow) {
    startTransition(async () => {
      const res = await revokePass({ vendorId: v.id });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`${v.name} → pass revoked`);
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
    <Paginated pageSize={15} className="space-y-2">
      {vendors.map((v) => {
        const livePass =
          v.passExpiresAt && Date.parse(v.passExpiresAt) > now
            ? v.passExpiresAt
            : null;
        return (
          <div
            key={v.id}
            className="overflow-hidden rounded-xl border border-border"
          >
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
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    title="Start date (blank = now)"
                    className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                  <div className="flex items-center gap-1">
                    <Input
                      inputMode="numeric"
                      value={days}
                      onChange={(e) => setDays(e.target.value)}
                      className="h-9 w-14 rounded-lg text-center text-sm"
                      title="Number of days"
                    />
                    <span className="text-xs text-muted-foreground">days</span>
                  </div>
                  <Button
                    size="sm"
                    className="rounded-lg"
                    disabled={pending}
                    onClick={() => {
                      const d = parseInt(days, 10);
                      if (!d || d < 1) {
                        toast.error("Enter days (1+)");
                        return;
                      }
                      grant(v, d);
                    }}
                  >
                    Grant pass
                  </Button>
                  <span className="mx-1 h-5 w-px bg-border" />
                  {livePass && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive hover:text-white"
                      disabled={pending}
                      onClick={() => revoke(v)}
                    >
                      Revoke pass
                    </Button>
                  )}
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
                  Pass starts on the date (blank = now) and runs the chosen
                  days. Amount records to revenue; blank/0 = free comp. Revoke
                  ends access now (not a refund).
                </p>
              </div>
            )}
          </div>
        );
      })}
    </Paginated>
  );
}
