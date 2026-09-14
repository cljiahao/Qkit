"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Read-only subscriber to printkit's own bridge Presence channel
 * (`printkit:presence:<vendorId>:<locationId>`, keyed by printkit's own
 * `print_locations.id`, not qkit's boothId) -- mirrors printkit's own
 * bridge-status.tsx. Never calls `.track()` itself; only the bridge device
 * (printkit's own dashboard, running in a browser tab paired to the
 * printer) publishes presence. `locationId` unset (booth never registered
 * with printkit yet) always reads offline.
 */
export function usePrinterPresence(
  vendorId: string,
  locationId: string | null | undefined,
): boolean {
  const [online, setOnline] = useState(false);

  useEffect(() => {
    if (!locationId) return;
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

  return locationId ? online : false;
}
