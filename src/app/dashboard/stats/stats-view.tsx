"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPrice } from "@/lib/utils";
import type { StatsSummary } from "@/lib/stats";

interface Props {
  summary: StatsSummary;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-bold">{value}</p>
    </div>
  );
}

export function StatsView({ summary }: Props) {
  const { revenue_cents, orderCount, aov_cents, topItems } = summary;

  if (orderCount === 0) {
    return (
      <div className="ticket overflow-hidden rounded-2xl border border-dashed border-border py-20 text-center">
        <p className="font-display text-2xl font-semibold">No orders yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing in this window — try a wider range.
        </p>
      </div>
    );
  }

  // ~44px per row keeps labels readable; min height avoids a squashed chart.
  const chartHeight = Math.max(160, topItems.length * 44);

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Revenue" value={formatPrice(revenue_cents)} />
        <Kpi label="Orders" value={String(orderCount)} />
        <Kpi label="Avg order" value={formatPrice(aov_cents)} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Top items
        </p>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={topItems}
            layout="vertical"
            margin={{ left: 8, right: 16, top: 0, bottom: 0 }}
          >
            <XAxis type="number" allowDecimals={false} hide />
            <YAxis
              type="category"
              dataKey="label"
              width={140}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--color-muted)", opacity: 0.3 }}
              formatter={(value, _name, item) => {
                const revenue =
                  (item?.payload as { revenue_cents?: number } | undefined)
                    ?.revenue_cents ?? 0;
                return [`${value} sold · ${formatPrice(revenue)}`, ""];
              }}
              labelFormatter={(label) => String(label)}
            />
            <Bar dataKey="quantity" radius={[0, 6, 6, 0]}>
              {topItems.map((t) => (
                <Cell key={t.label} fill="var(--color-primary)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
