"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn, formatPrice } from "@/lib/utils";
import type { TopItem } from "@/lib/stats";

type Metric = "quantity" | "revenue_cents";

function revenueCents(payload: unknown): number {
  return (payload as { revenue_cents?: number } | null)?.revenue_cents ?? 0;
}

export function TopItems({
  items,
  limit,
}: {
  items: TopItem[];
  limit?: number;
}) {
  const [metric, setMetric] = useState<Metric>("quantity");
  const ranked =
    metric === "revenue_cents"
      ? [...items].sort((a, b) => b.revenue_cents - a.revenue_cents)
      : items;
  const data = limit ? ranked.slice(0, limit) : ranked;
  const chartHeight = Math.max(140, data.length * 44);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Top items
        </p>
        <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
          {(
            [
              ["quantity", "By volume"],
              ["revenue_cents", "By revenue"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                metric === m
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
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
            formatter={(value, _name, item) => [
              `${item?.payload?.quantity ?? value} sold · ${formatPrice(revenueCents(item?.payload))}`,
              "",
            ]}
            labelFormatter={(label) => String(label)}
          />
          <Bar dataKey={metric} radius={[0, 6, 6, 0]}>
            {data.map((t) => (
              <Cell key={t.label} fill="var(--color-primary)" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
