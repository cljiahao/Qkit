import { StatusBadge } from "@merqo/ui";
import type { VendorStatus } from "@/lib/admin-vendor-health";

/**
 * Colour + label for each vendor status. One accent per band, reusing the
 * palette already in play (ember primary, emerald ok, cancelled red, amber
 * warning) so the admin reads it at a glance without a legend.
 */
const STATUS: Record<VendorStatus, { label: string; className: string }> = {
  attention: {
    label: "Needs attention",
    className:
      "text-status-cancelled border-status-cancelled/35 bg-status-cancelled/12",
  },
  expiring: {
    label: "Pass expiring",
    className:
      "text-amber-700 dark:text-amber-400 border-amber-500/35 bg-amber-500/12",
  },
  stuck: {
    label: "Stuck",
    className: "text-primary border-primary/35 bg-primary/12",
  },
  quiet: {
    label: "Quiet",
    className: "text-muted-foreground border-border bg-muted",
  },
  new: {
    label: "New",
    className:
      "text-blue-700 dark:text-blue-400 border-blue-500/35 bg-blue-500/12",
  },
  healthy: {
    label: "Healthy",
    className:
      "text-emerald-700 dark:text-emerald-400 border-emerald-500/35 bg-emerald-500/12",
  },
};

export function StatusChip({ status }: { status: VendorStatus }) {
  return <StatusBadge status={status} config={STATUS} />;
}
