import { ArrowDown, ArrowUp } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import type { StatsSummary } from "@/lib/stats";

type Deltas = {
  revenue: number | null;
  orders: number | null;
  aov: number | null;
} | null;

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[0.7rem] font-semibold tabular-nums",
        up
          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
          : "bg-status-cancelled/12 text-status-cancelled",
      )}
      title="vs the previous period"
    >
      <Icon className="size-3" />
      {Math.abs(Math.round(pct))}%
    </span>
  );
}

function Card({
  label,
  value,
  delta,
  big,
  index,
}: {
  label: string;
  value: string;
  delta?: number | null;
  big?: boolean;
  index: number;
}) {
  return (
    <div
      className={cn(
        "fade-rise flex flex-col justify-between gap-3 rounded-xl border p-4",
        big
          ? "border-primary/25 bg-gradient-to-br from-primary/[0.07] to-transparent sm:col-span-2"
          : "border-border bg-card",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {delta !== undefined && <Delta pct={delta} />}
      </div>
      <p
        className={cn(
          "font-mono font-bold leading-none tabular-nums",
          big ? "text-3xl sm:text-4xl" : "text-2xl",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Summary KPI band. Revenue leads (top-left, largest, ember-washed) per the
 * F-pattern. Free plans see Revenue/Orders/AOV only; Pro adds fulfilment +
 * cancelled and the period-over-period deltas.
 */
export function KpiRow({
  summary,
  deltas,
  pro,
}: {
  summary: StatsSummary;
  deltas: Deltas;
  pro: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <Card
        label="Revenue"
        value={formatPrice(summary.revenue_cents)}
        delta={deltas?.revenue}
        big
        index={0}
      />
      <Card
        label="Orders"
        value={String(summary.orderCount)}
        delta={deltas?.orders}
        index={1}
      />
      <Card
        label="Avg order"
        value={formatPrice(summary.aov_cents)}
        delta={deltas?.aov}
        index={2}
      />
      {pro && (
        <>
          <Card
            label="Fulfilled"
            value={`${Math.round(summary.fulfilmentRate * 100)}%`}
            index={3}
          />
          <Card label="Cancelled" value={String(summary.cancelled)} index={4} />
          {summary.refundCount > 0 && (
            <Card
              label="Refunds"
              value={formatPrice(summary.refunds_cents)}
              index={5}
            />
          )}
        </>
      )}
    </div>
  );
}
