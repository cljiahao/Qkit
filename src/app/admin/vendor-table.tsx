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
  // Snapshot once (lazy init avoids an impure Date.now() during render).
  const [now] = useState(() => Date.now());

  function flip(v: AdminVendorRow) {
    const next: Plan = v.plan === "pro" ? "free" : "pro";
    startTransition(async () => {
      const res = await setVendorPlan({ vendorId: v.id, plan: next });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`${v.name} → ${next}`);
      router.refresh();
    });
  }

  function grant(v: AdminVendorRow, hours: number) {
    startTransition(async () => {
      const res = await grantPass({
        vendorId: v.id,
        durationHours: hours,
        note: note.trim() || undefined,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`${v.name} → ${hours}h pass`);
      setGranting(null);
      setNote("");
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
                variant="outline"
                className="rounded-lg"
                disabled={pending}
                onClick={() => setGranting((id) => (id === v.id ? null : v.id))}
              >
                <Ticket className="size-3.5" /> Grant pass
              </Button>
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

            {granting === v.id && (
              <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-border bg-muted/30 px-4 py-3">
                <Input
                  placeholder="Payment note (e.g. PayNow ref)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-9 max-w-[16rem] flex-1 rounded-lg text-sm"
                />
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
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
