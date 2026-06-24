import { Children } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import type { SeriesPoint, StatsSummary, WaitPoint } from "@/lib/stats";
import { waitClock } from "./chart-format";
import { ServiceSpeedChart } from "./service-speed-chart";
import { KpiRow } from "./kpi-row";
import { ExportButton } from "./export-button";
import { TrendChart } from "./trend-chart";
import { BusyHeatmap } from "./busy-heatmap";
import { TopItems } from "./top-items";
import { OptionsBreakdown } from "./options-breakdown";
import { MarginTable } from "./margin-table";

type Deltas = {
  revenue: number | null;
  orders: number | null;
  aov: number | null;
} | null;

type Speed = {
  avgWaitSeconds: number | null;
  series: WaitPoint[] | null;
  peakThroughput: number;
} | null;

interface Props {
  summary: StatsSummary;
  deltas: Deltas;
  series: SeriesPoint[] | null;
  range: string;
  boothId: string;
  pro: boolean;
  speed?: Speed;
}

function hourLabel(h: number): string {
  const period = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${period}`;
}

/**
 * Reveals each child with an auto-ascending fade-rise stagger (see .fade-rise in
 * globals.css). Children render top-to-bottom, so delays stay monotonic no
 * matter which optional cards are present or how the list is reordered — no
 * hand-tuned per-card delays to keep in sync. Falsy children (omitted cards) are
 * dropped by Children.toArray, so there are never gaps.
 */
function Stagger({
  children,
  base = 120,
  step = 60,
}: {
  children: React.ReactNode;
  base?: number;
  step?: number;
}) {
  return Children.toArray(children).map((child, i) => (
    <div
      key={i}
      className="fade-rise"
      style={{ animationDelay: `${base + i * step}ms` }}
    >
      {child}
    </div>
  ));
}

export function StatsView({
  summary,
  deltas,
  series,
  range,
  boothId,
  pro,
  speed,
}: Props) {
  if (summary.orderCount === 0) {
    return (
      <div className="ticket overflow-hidden rounded-2xl border border-dashed border-border py-20 text-center">
        <p className="font-display text-2xl font-semibold">No orders yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing in this window — try a wider range.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <KpiRow summary={summary} deltas={deltas} pro={pro} />

      {pro ? (
        <Stagger>
          {/* ── Financial ────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <p className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              Financial
            </p>
            <hr className="perforation flex-1" />
            <ExportButton summary={summary} range={range} boothId={boothId} />
          </div>
          {series && <TrendChart series={series} range={range} />}
          <TopItems items={summary.topItems} />
          {summary.optionBreakdown.length > 0 && (
            <OptionsBreakdown options={summary.optionBreakdown} />
          )}
          {summary.grossMargin && <MarginTable summary={summary} />}

          {/* ── Operational ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <p className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              Operational
            </p>
            <hr className="perforation flex-1" />
          </div>
          {speed?.series &&
            speed.series.some((p) => p.avgWaitSeconds !== null) && (
              <ServiceSpeedChart
                series={speed.series}
                range={range}
                peakThroughput={speed.peakThroughput}
              />
            )}
          <BusyHeatmap summary={summary} />
        </Stagger>
      ) : (
        <Stagger>
          {summary.busiestHour !== null && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Busiest hour
              </p>
              <p className="mt-1 font-mono text-2xl font-bold">
                {hourLabel(summary.busiestHour)}
              </p>
            </div>
          )}
          {speed?.avgWaitSeconds != null && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Avg wait
              </p>
              <p className="mt-1 font-mono text-2xl font-bold">
                {waitClock(speed.avgWaitSeconds)}
              </p>
            </div>
          )}
          <TopItems items={summary.topItems} limit={3} />
          <Link
            href="/dashboard/plan"
            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/[0.04] px-4 py-5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <Lock className="size-4" />
            Upgrade for trends, busy-times heatmap, profit margins &amp; more
          </Link>
        </Stagger>
      )}
    </div>
  );
}
