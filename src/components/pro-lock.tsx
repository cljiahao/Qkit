"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { logEvent } from "@/app/actions/events";

/**
 * Contextual upgrade nudge shown inline at a gated feature. Naming the specific
 * feature (and logging which one was clicked) is what makes these convert far
 * better than a generic banner — and the per-feature signal feeds the admin
 * funnel so we learn which gate drives demand.
 */
export function ProLock({
  feature,
  label,
}: {
  feature: string;
  label: string;
}) {
  return (
    <Link
      href="/dashboard/plan"
      onClick={() => void logEvent("upgrade_cta", { feature })}
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
    >
      <Lock className="size-3" />
      {label}
    </Link>
  );
}
