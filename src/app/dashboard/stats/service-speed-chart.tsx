"use client";

import {
  Bar,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { shortDay } from "@/lib/tz";
import type { WaitPoint } from "@/lib/stats";

const RANGE_LABEL: Record<string, string> = {
  "24h": "last 24 hours",
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
};

/** Seconds → "4.2m" / "45s" for axis + tooltip. */
function fmtWait(seconds: number): string {
  return seconds >= 60
    ? `${(seconds / 60).toFixed(1)}m`
    : `${Math.round(seconds)}s`;
}

export function ServiceSpeedChart({
  series,
  range,
  peakThroughput,
}: {
  series: WaitPoint[];
  range: string;
  peakThroughput: number;
}) {
  const waits = series
    .map((p) => p.avgWaitSeconds)
    .filter((w): w is number => w !== null);
  // null (not 0) when no order has a wait — avoids a misleading dotted line at
  // the zero baseline that would read as "average wait is 0s".
  const avg = waits.length
    ? waits.reduce((a, b) => a + b, 0) / waits.length
    : null;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Service speed{" "}
          <span className="font-normal normal-case tracking-normal text-muted-foreground/70">
            · {RANGE_LABEL[range] ?? range}
          </span>
        </p>
        <p className="text-xs font-medium text-muted-foreground">
          Peak{" "}
          <span className="font-mono font-semibold text-foreground">
            {peakThroughput}/hr
          </span>
        </p>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart
          data={series}
          margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
        >
          <XAxis
            dataKey="t"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
            interval="preserveStartEnd"
            tickFormatter={(t) => shortDay(Number(t))}
          />
          <YAxis
            yAxisId="wait"
            width={44}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => fmtWait(Number(v))}
          />
          <YAxis yAxisId="vol" orientation="right" hide />
          <Tooltip
            cursor={{ stroke: "var(--color-border)" }}
            formatter={(value, name) =>
              name === "avgWaitSeconds"
                ? [fmtWait(Number(value)), "avg wait"]
                : [`${value} orders`, ""]
            }
            labelFormatter={(label) => shortDay(Number(label))}
          />
          <Bar
            yAxisId="vol"
            dataKey="orders"
            fill="var(--color-muted)"
            opacity={0.5}
            radius={[3, 3, 0, 0]}
          />
          {avg !== null && (
            <ReferenceLine
              yAxisId="wait"
              y={avg}
              stroke="var(--color-muted-foreground)"
              strokeDasharray="4 4"
            />
          )}
          <Line
            yAxisId="wait"
            type="monotone"
            dataKey="avgWaitSeconds"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </section>
  );
}
