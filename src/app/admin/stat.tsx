import { cn } from "@/lib/utils";
import { StatTile as SharedStatTile } from "@merqo/ui";

/**
 * A back-office figure, set in Space Mono like a printed receipt total. The
 * `featured` variant wears the ticket's perforated edge — the one figure that
 * leads the page. Wraps `@merqo/ui`'s shared `StatTile`/`DeltaPill` (the same
 * content `dashboard/stats/kpi-row.tsx` uses) in admin's own outer card shell,
 * since that treatment doesn't match the dashboard's.
 */
export function Stat({
  label,
  value,
  delta,
  big,
  featured,
  delay,
}: {
  label: string;
  value: string | number;
  delta?: number | null;
  big?: boolean;
  featured?: boolean;
  delay?: number;
}) {
  let valueSize: string;
  if (featured) valueSize = "text-4xl text-primary";
  else if (big) valueSize = "text-3xl";
  else valueSize = "text-2xl";
  return (
    <div
      className={cn(
        "fade-rise rounded-xl border border-border bg-card p-4",
        featured && "ticket bg-primary/[0.05]",
        big && "sm:col-span-2",
      )}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <SharedStatTile
        label={label}
        value={String(value)}
        valueClassName={cn("font-mono font-bold tabular-nums", valueSize)}
        delta={delta}
        deltaTooltip="vs the previous 7 days"
        deltaDownClassName="bg-status-cancelled/12 text-status-cancelled"
      />
    </div>
  );
}
