import { formatPrice } from "@/lib/utils";
import type { StatsSummary } from "@/lib/stats";

/**
 * Profitability view (Pro). Renders only when the vendor has entered at least
 * one item cost (`grossMargin` non-null). Ranks items by profit contribution —
 * what actually makes money, not just what sells most.
 */
export function MarginTable({ summary }: { summary: StatsSummary }) {
  const gm = summary.grossMargin;
  if (!gm) return null;

  // Rank by profit contribution, then take the top slice. computeStats no longer
  // pre-slices to top-N by quantity (it now returns the full per-item set, capped
  // at 50 by quantity), so a high-margin lower-volume item within that set can
  // reach the top of this table where the old top-8-by-quantity list hid it.
  const ranked = summary.topItems
    .filter((i) => i.cost_cents > 0)
    .sort((a, b) => b.profit_cents - a.profit_cents)
    .slice(0, 8);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Profit &amp; margin
        </p>
        <p className="text-xs font-medium text-muted-foreground">
          Gross margin{" "}
          <span className="font-mono font-semibold text-foreground">
            {Math.round(gm.marginPct)}%
          </span>{" "}
          · {formatPrice(gm.profit_cents)} profit
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="pb-2 font-semibold">Item</th>
              <th className="pb-2 text-right font-semibold">Sold</th>
              <th className="pb-2 text-right font-semibold">Profit</th>
              <th className="pb-2 text-right font-semibold">Margin</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((i) => {
              const marginPct = i.revenue_cents
                ? (i.profit_cents / i.revenue_cents) * 100
                : 0;
              return (
                <tr key={i.label} className="border-b border-border/50">
                  <td className="py-2 pr-2">{i.label}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {i.quantity}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums">
                    {formatPrice(i.profit_cents)}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums">
                    {Math.round(marginPct)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
