import type { StatsSummary } from "@/lib/stats";
import { hourLabel } from "./chart-format";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Day × hour busyness grid (SGT). Colour intensity = order volume, so the
 * weekly rush pattern reads in one glance. Pure CSS — no chart library.
 */
export function BusyHeatmap({ summary }: { summary: StatsSummary }) {
  const { dayHour } = summary;
  let max = 0;
  let peak: { day: number; hour: number; orders: number } | null = null;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const v = dayHour[d][h];
      if (v > max) max = v;
      if (peak === null || v > peak.orders)
        peak = { day: d, hour: h, orders: v };
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Busy times
        </p>
        {peak && peak.orders > 0 && (
          <p className="text-xs font-medium text-muted-foreground">
            Peak{" "}
            <span className="font-semibold text-foreground">
              {DAYS[peak.day]} {hourLabel(peak.hour)}
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {DAYS.map((day, d) => (
          <div key={day} className="flex items-center gap-1.5">
            <span className="w-8 shrink-0 text-right font-mono text-[0.65rem] text-muted-foreground">
              {day}
            </span>
            <div
              className="grid flex-1 gap-[2px]"
              style={{ gridTemplateColumns: "repeat(24, 1fr)" }}
            >
              {dayHour[d].map((orders, h) => (
                <div
                  key={h}
                  className="aspect-square rounded-[2px]"
                  style={{
                    backgroundColor: "var(--color-primary)",
                    opacity: max ? 0.06 + (orders / max) * 0.94 : 0.06,
                  }}
                  title={`${day} ${hourLabel(h)} — ${orders} order${orders === 1 ? "" : "s"}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex justify-between pl-[38px] font-mono text-[0.6rem] text-muted-foreground">
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>11p</span>
      </div>
    </section>
  );
}
