"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Read-only subscriber to printkit's own bridge Presence channel
 * (`printkit:presence:<vendorId>:<locationId>`, keyed by printkit's own
 * `print_locations.id`, not qkit's boothId) -- mirrors printkit's own
 * bridge-status.tsx. Never calls `.track()` itself; only the bridge device
 * (printkit's own dashboard, running in a browser tab paired to the
 * printer) publishes presence.
 */
export function PrinterStatus({
  vendorId,
  locationId,
}: {
  vendorId: string;
  locationId: string;
}) {
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(
      `printkit:presence:${vendorId}:${locationId}`,
    );

    const syncState = () => {
      const state = channel.presenceState() as Record<string, unknown[]>;
      setOnline(Boolean(state.bridge?.length));
    };

    channel.on("presence", { event: "sync" }, syncState).subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [vendorId, locationId]);

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
