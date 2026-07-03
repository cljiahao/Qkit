import { Children } from "react";
import Link from "next/link";
import { Clock, DollarSign, Lock, Package, Timer, Trophy } from "lucide-react";
import type { SeriesPoint, StatsSummary, WaitPoint } from "@/lib/stats";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hourLabel, waitClock } from "./chart-format";
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

/**
 * Reveals each child with an auto-ascending fade-rise stagger (see .fade-rise in
 * globals.css). Children render top-to-bottom, so delays stay monotonic no
 * matter which optional cards are present or how the list is reordered — no
 * hand-tuned per-card delays to keep in sync. Falsy children (omitted cards) are
 * dropped by Children.toArray, so there are never gaps.
 */
function Stagger({
  children,
  base = 60,
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

/**
 * At-a-glance highlight tile: a qualitative headline (best seller, busiest hour)
 * set in Fraunces on an ember-washed ticket, distinct from the numeric KPI band.
 * Purely historical — everything shown comes from the computed summary.
 */
function Highlight({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <div className="fade-rise overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-transparent p-4">
      <div className="flex items-center gap-1.5 text-primary">
        <Icon className="size-3.5" />
        <p className="text-[0.7rem] font-semibold uppercase tracking-wider">
          {label}
        </p>
      </div>
      <p className="mt-1.5 truncate font-display text-xl font-semibold leading-tight">
        {value}
      </p>
      {caption && (
        <p className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
          {caption}
        </p>
      )}
    </div>
  );
}

/** Eyebrow + hairline divider that titles a tab's content. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <p className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
        {children}
      </p>
      <hr className="perforation flex-1" />
    </div>
  );
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
          Nothing in this window. Try a wider range.
        </p>
      </div>
    );
  }

  // At-a-glance values, all straight from the computed summary (no live data).
  const bestSeller = summary.topItems[0] ?? null; // quantity-sorted -> top volume
  const busiestHour = summary.busiestHour;
  const busiestOrders =
    busiestHour !== null ? (summary.hourly[busiestHour]?.orders ?? 0) : 0;
  const avgWait = speed?.avgWaitSeconds ?? null;

  const hasServiceSpeed = Boolean(
    speed?.series && speed.series.some((p) => p.avgWaitSeconds !== null),
  );

  return (
    <div className="space-y-6">
      {/* ── Pinned metric strip: always visible, above the tabs ─────────────── */}
      <div className="space-y-3">
        {pro && (
          <div className="flex items-center justify-end">
            <ExportButton summary={summary} range={range} boothId={boothId} />
          </div>
        )}

        <KpiRow summary={summary} deltas={deltas} pro={pro} />

        {(bestSeller || busiestHour !== null || avgWait != null) && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {bestSeller && (
              <Highlight
                icon={Trophy}
                label="Best seller"
                value={bestSeller.label}
                caption={`${bestSeller.quantity} sold`}
              />
            )}
            {busiestHour !== null && (
              <Highlight
                icon={Clock}
                label="Busiest hour"
                value={hourLabel(busiestHour, { long: true })}
                caption={`${busiestOrders} order${busiestOrders === 1 ? "" : "s"}`}
              />
            )}
            {/* Avg wait as a highlight only where there's no Service chart (free). */}
            {!pro && avgWait != null && (
              <Highlight
                icon={Timer}
                label="Avg wait"
                value={waitClock(avgWait)}
              />
            )}
          </div>
        )}
      </div>

      {pro ? (
        <Tabs defaultValue="sales">
          <TabsList>
            <TabsTrigger value="sales">
              <DollarSign />
              Sales
            </TabsTrigger>
            <TabsTrigger value="items">
              <Package />
              Items
            </TabsTrigger>
            <TabsTrigger value="service">
              <Timer />
              Service
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sales">
            <div className="space-y-4">
              <Stagger>
                <SectionLabel>Sales</SectionLabel>
                {series && <TrendChart series={series} range={range} />}
                {summary.grossMargin && <MarginTable summary={summary} />}
              </Stagger>
            </div>
          </TabsContent>

          <TabsContent value="items">
            <div className="space-y-4">
              <Stagger>
                <SectionLabel>Items</SectionLabel>
                <TopItems items={summary.topItems} />
                {summary.optionBreakdown.length > 0 && (
                  <OptionsBreakdown options={summary.optionBreakdown} />
                )}
              </Stagger>
            </div>
          </TabsContent>

          <TabsContent value="service">
            <div className="space-y-4">
              <Stagger>
                <SectionLabel>Service</SectionLabel>
                {hasServiceSpeed && speed?.series && (
                  <ServiceSpeedChart
                    series={speed.series}
                    range={range}
                    peakThroughput={speed.peakThroughput}
                  />
                )}
                <BusyHeatmap summary={summary} />
              </Stagger>
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-4">
          <Stagger>
            <TopItems items={summary.topItems} limit={3} />
            <Link
              href="/dashboard/plan"
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/[0.04] px-4 py-5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <Lock className="size-4" />
              Upgrade for trends, busy-times heatmap, profit margins and more
            </Link>
          </Stagger>
        </div>
      )}
    </div>
  );
}
