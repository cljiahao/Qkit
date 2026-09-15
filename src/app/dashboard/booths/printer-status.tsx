"use client";

import { cn } from "@/lib/utils";

// Presentational only -- printing-section.tsx owns the presence subscription.
export function PrinterStatus({ online }: { online: boolean }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm"
    >
      <span
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          online ? "bg-status-ready" : "bg-status-cancelled",
        )}
        aria-hidden
      />
      <span
        className={cn(
          "font-medium",
          online ? "text-status-ready" : "text-status-cancelled",
        )}
      >
        {online ? "Printer connected" : "No printer connected"}
      </span>
      {!online && (
        <span className="text-muted-foreground">
          . Open the bridge on your printing device
        </span>
      )}
    </div>
  );
}
