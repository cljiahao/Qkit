import Link from "next/link";
import { Lock } from "lucide-react";
import type { StatsSummary } from "@/lib/stats";
import { KpiRow } from "./kpi-row";
import { BusyHeatmap } from "./busy-heatmap";
import { TopItems } from "./top-items";
import { OptionsBreakdown } from "./options-breakdown";
import { MarginTable } from "./margin-table";

type Deltas = {
  revenue: number | null;
  orders: number | null;
  aov: number | null;
} | null;

interface Props {
  summary: StatsSummary;
  deltas: Deltas;
  pro: boolean;
}

function hourLabel(h: number): string {
  const period = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${period}`;
}

/** One reveal block — staggers in on load (see .fade-rise in globals.css). */
function Block({
  delay,
  children,
}: {
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <div className="fade-rise" style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export function StatsView({ summary, deltas, pro }: Props) {
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
        <>
          <Block delay={180}>
            <BusyHeatmap summary={summary} />
          </Block>
          <Block delay={240}>
            <TopItems items={summary.topItems} />
          </Block>
          {summary.optionBreakdown.length > 0 && (
            <Block delay={300}>
              <OptionsBreakdown options={summary.optionBreakdown} />
            </Block>
          )}
          {summary.grossMargin && (
            <Block delay={360}>
              <MarginTable summary={summary} />
            </Block>
          )}
        </>
      ) : (
        <>
          {summary.busiestHour !== null && (
            <Block delay={180}>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Busiest hour
                </p>
                <p className="mt-1 font-mono text-2xl font-bold">
                  {hourLabel(summary.busiestHour)}
                </p>
              </div>
            </Block>
          )}
          <Block delay={240}>
            <TopItems items={summary.topItems} limit={3} />
          </Block>
          <Block delay={300}>
            <Link
              href="/dashboard/plan"
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/[0.04] px-4 py-5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <Lock className="size-4" />
              Upgrade for trends, busy-times heatmap, profit margins &amp; more
            </Link>
          </Block>
        </>
      )}
    </div>
  );
}
