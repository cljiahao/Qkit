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

/**
 * The one tile the whole stats strip is built from — every metric wears the same
 * clothes: a small uppercase label (with an optional delta pill), a large mono
 * tabular-nums value, and an optional caption underneath. Money KPIs, order
 * counts, and the qualitative context tiles (best seller, busiest hour, avg
 * wait) all render through this, so the strip reads as one grid instead of a
 * mix of styles. `primary` gives the lead metric a quiet ember frame — the only
 * accent, so nothing else competes.
 */
export function StatTile({
  label,
  value,
  delta,
  caption,
  primary,
  index = 0,
}: {
  label: string;
  value: string;
  delta?: number | null;
  caption?: string;
  primary?: boolean;
  index?: number;
}) {
  return (
    <div
      className={cn(
        "fade-rise flex flex-col gap-2 rounded-xl border bg-card p-4",
        primary ? "border-primary/30" : "border-border",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={cn(
            "text-[0.7rem] font-semibold uppercase tracking-wider",
            primary ? "text-primary" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        {delta !== undefined && <Delta pct={delta} />}
      </div>
      <p className="truncate font-mono text-2xl font-bold leading-none tabular-nums">
        {value}
      </p>
      {caption && (
        <p className="truncate font-mono text-xs text-muted-foreground tabular-nums">
          {caption}
        </p>
      )}
    </div>
  );
}

/**
 * Range KPI band — the money/orders numbers for the SELECTED window. Revenue
 * leads (top-left, ember-framed) per the F-pattern. Free plans see
 * Revenue/Orders/AOV; Pro adds fulfilment, cancelled, and refunds plus the
 * period-over-period deltas. Values are range-scoped — the strip's "Showing …"
 * caption above names the window.
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
      <StatTile
        label="Revenue"
        value={formatPrice(summary.revenue_cents)}
        delta={deltas?.revenue}
        primary
        index={0}
      />
      <StatTile
        label="Orders"
        value={String(summary.orderCount)}
        delta={deltas?.orders}
        index={1}
      />
      <StatTile
        label="Avg order"
        value={formatPrice(summary.aov_cents)}
        delta={deltas?.aov}
        index={2}
      />
      {pro && (
        <>
          <StatTile
            label="Fulfilled"
            value={`${Math.round(summary.fulfilmentRate * 100)}%`}
            index={3}
          />
          <StatTile
            label="Cancelled"
            value={String(summary.cancelled)}
            index={4}
          />
          {summary.refundCount > 0 && (
            <StatTile
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

/**
 * Lifetime totals — deliberately set apart from the range KPIs so the two are
 * never confused. It carries an ember wash + a "Since you started" header, and
 * its numbers are all-time across every booth (independent of the range/booth
 * filters above), which the sub-label states outright.
 */
export function AllTimeBand({
  orders,
  revenue_cents,
}: {
  orders: number;
  revenue_cents: number;
}) {
  return (
    <div className="fade-rise rounded-xl border border-primary/20 bg-primary/[0.05] p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-primary">
          Since you started
        </p>
        <p className="text-[0.7rem] text-muted-foreground">
          all time · every booth
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Total orders
          </p>
          <p className="font-mono text-2xl font-bold leading-none tabular-nums text-primary">
            {orders}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Total earned
          </p>
          <p className="truncate font-mono text-2xl font-bold leading-none tabular-nums text-primary">
            {formatPrice(revenue_cents)}
          </p>
        </div>
      </div>
    </div>
  );
}
