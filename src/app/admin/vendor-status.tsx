import { cn } from "@/lib/utils";
import type { VendorStatus } from "@/lib/admin-vendor-health";

/**
 * Colour + label for each vendor status. One accent per band, reusing the
 * palette already in play (ember primary, emerald ok, cancelled red, amber
 * warning) so the admin reads it at a glance without a legend.
 */
const STATUS: Record<VendorStatus, { label: string; className: string }> = {
  attention: {
    label: "Needs attention",
    className: "bg-status-cancelled/12 text-status-cancelled",
  },
  expiring: {
    label: "Pass expiring",
    className: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
  },
  stuck: {
    label: "Stuck",
    className: "bg-primary/12 text-primary",
  },
  quiet: {
    label: "Quiet",
    className: "bg-muted text-muted-foreground",
  },
  new: {
    label: "New",
    className: "bg-blue-500/12 text-blue-700 dark:text-blue-400",
  },
  healthy: {
    label: "Healthy",
    className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  },
};

export function StatusChip({
  status,
  className,
}: {
  status: VendorStatus;
  className?: string;
}) {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        s.className,
        className,
      )}
    >
      {s.label}
    </span>
  );
}
