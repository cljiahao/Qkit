"use client";

import { Ticket } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { sgtWeekdayTime } from "@/lib/tz";

function format(msLeft: number): string {
  const totalMin = Math.max(0, Math.floor(msLeft / 60_000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

/** Live countdown for an active pass. Ticks each minute. */
export function PassCountdown({ expiresAt }: { expiresAt: string }) {
  const left = Date.parse(expiresAt) - useNow(60_000);
  // Fixed to SGT so the server and client render the same string (no hydration
  // mismatch), unlike a runtime-tz toLocaleString.
  const until = sgtWeekdayTime(expiresAt);

  return (
    <div className="ticket flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <Ticket className="size-5 shrink-0 text-primary" />
      <div>
        <p className="font-display text-lg font-semibold text-primary">
          Pro until {until}
        </p>
        <p className="text-sm text-muted-foreground">{format(left)}</p>
      </div>
    </div>
  );
}
