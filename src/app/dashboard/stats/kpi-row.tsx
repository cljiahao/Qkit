import { ArrowDown, ArrowUp } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import type { StatsSummary } from "@/lib/stats";
import { StatBreakdownTile, type BreakdownRow } from "./stat-breakdown";

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
  hint,
  primary,
  index = 0,
}: {
  label: string;
  value: string;
  delta?: number | null;
  caption?: string;
  /** Hover tooltip (native title), e.g. the cancelled count behind Fulfilled. */
  hint?: string;
  primary?: boolean;
  index?: number;
}) {
  return (
    <div
      title={hint}
      className={cn(
        "fade-rise flex flex-col gap-2 rounded-xl border bg-card p-4",
        primary ? "border-primary/30" : "border-border",
        hint && "cursor-help",
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
  rangeLabel,
  allTime,
}: {
  summary: StatsSummary;
  deltas: Deltas;
  pro: boolean;
  rangeLabel?: string;
  allTime?: { orders: number; revenue_cents: number };
}) {
  const rl = rangeLabel ? ` · ${rangeLabel}` : "";
  const cancelledHint =
    summary.cancelled === 0
      ? `No cancellations${rl}`
      : `${summary.cancelled} cancelled${rl}`;

  // Per-item breakdowns behind the Revenue and Orders tiles (hover / tap).
  const revenueRows: BreakdownRow[] = [...summary.topItems]
    .filter((i) => i.revenue_cents > 0)
    .sort((a, b) => b.revenue_cents - a.revenue_cents)
    .slice(0, 6)
    .map((i) => ({ label: i.label, value: formatPrice(i.revenue_cents) }));
  const orderRows: BreakdownRow[] = [...summary.topItems]
    .filter((i) => i.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 6)
    .map((i) => ({ label: i.label, value: String(i.quantity) }));

  // Lifetime totals ride as a caption under the matching range tile (hidden for
  // a brand-new vendor with no all-time orders).
  const showAllTime = allTime !== undefined && allTime.orders > 0;
  const revenueCaption = showAllTime
    ? `${formatPrice(allTime.revenue_cents)} all time`
    : undefined;
  const ordersCaption = showAllTime ? `${allTime.orders} all time` : undefined;

  // Fulfilled shown as fulfilled / decided (completed + cancelled); the cancelled
  // count rides in the tooltip.
  const decided = summary.completed + summary.cancelled;
  const fulfilledValue =
    decided > 0 ? `${summary.completed}/${decided}` : "0/0";
  const fulfilledCaption = `${Math.round(summary.fulfilmentRate * 100)}% fulfilled`;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <StatBreakdownTile
        label="Revenue"
        value={formatPrice(summary.revenue_cents)}
        caption={revenueCaption}
        rows={revenueRows}
        breakdownLabel="Revenue by item"
        deltaSlot={<Delta pct={deltas?.revenue ?? null} />}
        primary
        index={0}
      />
      <StatBreakdownTile
        label="Orders"
        value={String(summary.orderCount)}
        caption={ordersCaption}
        rows={orderRows}
        breakdownLabel="Orders by item"
        deltaSlot={<Delta pct={deltas?.orders ?? null} />}
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
            value={fulfilledValue}
            caption={fulfilledCaption}
            hint={cancelledHint}
            index={3}
          />
          {summary.refundCount > 0 && (
            <StatTile
              label="Refunds"
              value={formatPrice(summary.refunds_cents)}
              index={4}
            />
          )}
        </>
      )}
    </div>
  );
}
