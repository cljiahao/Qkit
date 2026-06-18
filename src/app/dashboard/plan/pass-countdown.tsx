"use client";

import { useEffect, useState } from "react";
import { Ticket } from "lucide-react";

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
  const expiryMs = Date.parse(expiresAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const left = expiryMs - now;
  const until = new Date(expiryMs).toLocaleString("en-SG", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

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
