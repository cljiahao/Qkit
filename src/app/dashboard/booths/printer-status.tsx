"use client";

import { StatusBadge } from "@merqo/ui";

type PrinterPresence = "online" | "offline";

const STATUS_CONFIG: Record<
  PrinterPresence,
  { label: string; className: string }
> = {
  online: {
    label: "Printer connected",
    className: "text-status-ready border-status-ready/35 bg-status-ready/12",
  },
  offline: {
    label: "No printer connected",
    className:
      "text-status-cancelled border-status-cancelled/35 bg-status-cancelled/12",
  },
};

// Presentational only -- printing-section.tsx owns the presence subscription.
export function PrinterStatus({ online }: { online: boolean }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm">
      <StatusBadge
        status={online ? "online" : "offline"}
        config={STATUS_CONFIG}
      />
      {!online && (
        <span className="text-muted-foreground">
          Open the bridge on your printing device
        </span>
      )}
    </div>
  );
}
