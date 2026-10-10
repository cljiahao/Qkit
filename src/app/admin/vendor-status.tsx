import { StatusBadge } from "@merqo/ui";
import type { VendorStatus } from "@/lib/admin/vendor-health";

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
    className: "text-warning border-warning/35 bg-warning/12",
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
      "text-status-confirmed border-status-confirmed/35 bg-status-confirmed/12",
  },
  healthy: {
    label: "Healthy",
    className: "text-success border-success/35 bg-success/12",
  },
};

export function StatusChip({ status }: { status: VendorStatus }) {
  return <StatusBadge status={status} config={STATUS} />;
}
