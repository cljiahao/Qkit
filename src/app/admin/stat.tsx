import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** Period-over-period delta chip (vs the previous 7 days). */
export function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-mono text-xs font-semibold",
        up ? "text-emerald-600" : "text-status-cancelled",
      )}
      title="vs the previous 7 days"
    >
      <Icon className="size-3" />
      {Math.abs(Math.round(pct))}%
    </span>
  );
}

/**
 * A back-office figure, set in Space Mono like a printed receipt total. The
 * `featured` variant wears the ticket's perforated edge — the one figure that
 * leads the page.
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
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {delta !== undefined && <Delta pct={delta} />}
      </div>
      <p className={cn("mt-1 font-mono font-bold tabular-nums", valueSize)}>
        {value}
      </p>
    </div>
  );
}
