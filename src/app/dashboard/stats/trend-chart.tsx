"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPrice } from "@/lib/utils";
import type { SeriesPoint } from "@/lib/stats";

const RANGE_LABEL: Record<string, string> = {
  "24h": "last 24 hours",
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
};

function ordersOf(payload: unknown): number {
  return (payload as { orders?: number } | null)?.orders ?? 0;
}

/** Revenue trend across the window — shape of growth, not just the delta. */
export function TrendChart({
  series,
  range,
}: {
  series: SeriesPoint[];
  range: string;
}) {
  const data = series.map((p, i) => ({ ...p, i }));

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Revenue trend{" "}
        <span className="font-normal normal-case tracking-normal text-muted-foreground/70">
          · {RANGE_LABEL[range] ?? range}
        </span>
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart
          data={data}
          margin={{ left: -18, right: 8, top: 4, bottom: 0 }}
        >
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--color-primary)"
                stopOpacity={0.35}
              />
              <stop
                offset="100%"
                stopColor="var(--color-primary)"
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>
          <XAxis dataKey="i" hide />
          <YAxis
            width={28}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${Math.round(Number(v) / 100)}`}
          />
          <Tooltip
            cursor={{ stroke: "var(--color-border)" }}
            formatter={(value, _name, item) => [
              `${formatPrice(Number(value))} · ${ordersOf(item?.payload)} orders`,
              "",
            ]}
            labelFormatter={() => ""}
          />
          <Area
            type="monotone"
            dataKey="revenue_cents"
            stroke="var(--color-primary)"
            strokeWidth={2}
            fill="url(#revFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
