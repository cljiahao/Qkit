"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/**
 * The grant-pass / revoke / flip-plan panel for ONE vendor. Lives on the vendor
 * detail page; the money note + amount feed the revenue ledger, the date + days
 * define the pass window (SGT). Extracted so the vendors list stays a lean
 * triage table.
 */
export function VendorManage({ vendor }: { vendor: AdminVendorRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  // $ collected; blank = free comp
  const [amount, setAmount] = useState("");
  // "YYYY-MM-DD"; blank = now
  const [startDate, setStartDate] = useState("");
  const [days, setDays] = useState("1");
  // Snapshot once (lazy init avoids an impure Date.now() during render).
  const [now] = useState(() => Date.now());

  const livePass =
    vendor.passExpiresAt && Date.parse(vendor.passExpiresAt) > now
      ? vendor.passExpiresAt
      : null;

  // Shared by grant + make-pro: parse the $ field to cents (blank/invalid = 0 = comp).
  function parseAmountCents(): number {
    const r = parseDollarsToCents(amount);
    return r.ok && r.cents !== undefined ? r.cents : 0;
  }

  function reset() {
    setNote("");
    setAmount("");
    setStartDate("");
    setDays("1");
  }

  // Interpret the date-only input as SGT midnight (QKit is UTC+8), NOT the
  // browser/UTC midnight Date.parse("YYYY-MM-DD") would give — otherwise a
  // granted pass starts up to 8h off from the event day the admin picked.
  function startIso(): string | undefined {
    if (!startDate) return undefined;
    const ms = Date.parse(`${startDate}T00:00:00+08:00`);
    return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
  }

  function flip() {
    const next: Plan = vendor.plan === "pro" ? "free" : "pro";
    const amountCents = parseAmountCents();
    startTransition(async () => {
      const res = await setVendorPlan({
        vendorId: vendor.id,
        plan: next,
        amountCents,
        note: note.trim() || undefined,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `${vendor.name} → ${next}${next === "pro" && amountCents ? ` · $${centsToDollarString(amountCents)}` : ""}`,
      );
      reset();
      router.refresh();
    });
  }

  function grant(d: number) {
    const amountCents = parseAmountCents();
    startTransition(async () => {
      const res = await grantPass({
        vendorId: vendor.id,
        days: d,
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
        `${vendor.name} → ${d}-day pass${when}${amountCents ? ` · $${centsToDollarString(amountCents)}` : " · free"}`,
      );
      reset();
      router.refresh();
    });
  }

  function revoke() {
    startTransition(async () => {
      const res = await revokePass({ vendorId: vendor.id });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`${vendor.name} → pass revoked`);
      reset();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3">
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
            grant(d);
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
            onClick={() => revoke()}
          >
            Revoke pass
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg"
          disabled={pending}
          onClick={() => flip()}
        >
          {vendor.plan === "pro" ? (
            "Downgrade"
          ) : (
            <>
              <Sparkles className="size-3.5" /> Make Pro
            </>
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Pass starts on the date (blank = now) and runs the chosen days. Amount
        records to revenue; blank/0 = free comp. Revoke ends access now (not a
        refund).
      </p>
    </div>
  );
}
