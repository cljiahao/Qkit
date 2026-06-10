"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setVendorPlan } from "./actions";
import type { Plan } from "@/lib/types";

export type AdminVendorRow = {
  id: string;
  name: string;
  plan: Plan;
  created_at: string;
};

export function VendorTable({ vendors }: { vendors: AdminVendorRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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

  if (vendors.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        No vendors yet.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Vendor</span>
        <span>Plan</span>
        <span className="text-right">Action</span>
      </div>
      {vendors.map((v) => (
        <div
          key={v.id}
          className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-t border-border px-4 py-3 text-sm"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{v.name}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {v.created_at.slice(0, 10)}
            </p>
          </div>
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
            onClick={() => flip(v)}
          >
            {v.plan === "pro" ? "Downgrade" : "Make Pro"}
          </Button>
        </div>
      ))}
    </div>
  );
}
