// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiRow } from "./kpi-row";
import { MarginTable } from "./margin-table";
import { ServiceSpeedChart } from "./service-speed-chart";
import { StatsView } from "./stats-view";
import { fmtWait, waitClock } from "./chart-format";
import type { StatsSummary, TopItem } from "@/lib/stats";

function topItem(over: Partial<TopItem> = {}): TopItem {
  return {
    label: "Kopi",
    quantity: 9,
    revenue_cents: 900,
    cost_cents: 0,
    profit_cents: 900,
    ...over,
  };
}

function summary(over: Partial<StatsSummary> = {}): StatsSummary {
  return {
    revenue_cents: 10000,
    orderCount: 20,
    aov_cents: 500,
    cancelled: 2,
    refunds_cents: 0,
    refundCount: 0,
    fulfilmentRate: 0.9,
    topItems: [],
    hourly: [],
    busiestHour: null,
    dayHour: Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => 0),
    ),
    optionBreakdown: [],
    grossMargin: null,
    ...over,
  };
}

describe("KpiRow", () => {
  it("shows Pro cards + period deltas", () => {
    render(
      <KpiRow
        summary={summary()}
        deltas={{ revenue: 25, orders: -10, aov: 0 }}
        pro
      />,
    );
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument(); // up
    expect(screen.getByText("10%")).toBeInTheDocument(); // down, abs value
    expect(screen.getByText("Fulfilled")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("hides Pro-only cards and deltas on free", () => {
    render(<KpiRow summary={summary()} deltas={null} pro={false} />);
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.queryByText("Fulfilled")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancelled")).not.toBeInTheDocument();
    expect(screen.queryByText("25%")).not.toBeInTheDocument();
  });
});

describe("MarginTable", () => {
  it("renders nothing when there is no cost data", () => {
    const { container } = render(
      <MarginTable summary={summary({ grossMargin: null })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows gross margin + per-item profit, ranked by profit", () => {
    render(
      <MarginTable
        summary={summary({
          grossMargin: {
            revenue_cents: 500,
            cost_cents: 140,
            profit_cents: 360,
            marginPct: 72,
          },
          topItems: [
            {
              label: "Teh",
              quantity: 1,
              revenue_cents: 100,
              cost_cents: 40,
              profit_cents: 60,
            },
            {
              label: "Kopi",
              quantity: 2,
              revenue_cents: 400,
              cost_cents: 100,
              profit_cents: 300,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText(/72%/)).toBeInTheDocument(); // gross margin header
    expect(screen.getByText("Kopi")).toBeInTheDocument();
    expect(screen.getByText("$3.00")).toBeInTheDocument(); // Kopi profit
    expect(screen.getByText("75%")).toBeInTheDocument(); // Kopi margin 300/400
    // Kopi (300) ranks above Teh (60).
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Kopi");
    expect(rows[2]).toHaveTextContent("Teh");
  });
});

describe("ServiceSpeedChart", () => {
  const series = [
    { t: 1, avgWaitSeconds: 120, orders: 3 },
    { t: 2, avgWaitSeconds: 300, orders: 8 },
  ];

  it("renders the heading and peak throughput", () => {
    render(<ServiceSpeedChart series={series} range="7d" peakThroughput={8} />);
    expect(screen.getByText(/service speed/i)).toBeInTheDocument();
    expect(screen.getByText(/8\s*\/\s*hr/i)).toBeInTheDocument();
  });

  it("renders without crashing when no order has a wait (empty / all-null)", () => {
    const noWaits = [
      { t: 1, avgWaitSeconds: null, orders: 2 },
      { t: 2, avgWaitSeconds: null, orders: 5 },
    ];
    render(
      <ServiceSpeedChart series={noWaits} range="7d" peakThroughput={5} />,
    );
    // Header still renders; the avg reference line is simply omitted (no crash,
    // no misleading zero line).
    expect(screen.getByText(/service speed/i)).toBeInTheDocument();
    expect(screen.getByText(/5\s*\/\s*hr/i)).toBeInTheDocument();
  });
});

describe("StatsView", () => {
  it("shows the empty state when there are no orders", () => {
    render(
      <StatsView
        summary={summary({ orderCount: 0 })}
        deltas={null}
        series={null}
        range="7d"
        boothId="all"
        pro
      />,
    );
    expect(screen.getByText(/no orders yet/i)).toBeInTheDocument();
  });

  it("pro: pins the metric strip + at-a-glance highlights above three tabs", () => {
    render(
      <StatsView
        summary={summary({
          topItems: [topItem({ label: "Kopi", quantity: 9 })],
          busiestHour: 12,
          hourly: Array.from({ length: 24 }, (_, hour) => ({
            hour,
            orders: hour === 12 ? 9 : 0,
            revenue_cents: 0,
          })),
        })}
        deltas={null}
        series={null}
        range="7d"
        boothId="all"
        pro
      />,
    );
    // Range indicator names the window the KPIs are scoped to.
    expect(screen.getByText("Showing")).toBeInTheDocument();
    expect(screen.getByText("last 7 days")).toBeInTheDocument();
    // At-a-glance context tiles (historical, from the summary).
    expect(screen.getByText("Best seller")).toBeInTheDocument();
    expect(screen.getByText("Kopi")).toBeInTheDocument();
    expect(screen.getByText("Busiest hour")).toBeInTheDocument();
    expect(screen.getByText("12pm")).toBeInTheDocument();
    // Three touch tabs, Sales selected by default.
    expect(screen.getByRole("tab", { name: /sales/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /items/i })).toBeInTheDocument();
    const service = screen.getByRole("tab", { name: /service/i });
    expect(service).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /sales/i })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(service).toHaveAttribute("data-state", "inactive");
    // Export stays reachable from the pinned strip.
    expect(
      screen.getByRole("button", { name: /export csv/i }),
    ).toBeInTheDocument();
  });

  it("free: no tabs, but keeps the highlights + upgrade CTA", () => {
    render(
      <StatsView
        summary={summary({
          topItems: [topItem({ label: "Teh" })],
          busiestHour: 9,
          hourly: Array.from({ length: 24 }, (_, hour) => ({
            hour,
            orders: hour === 9 ? 4 : 0,
            revenue_cents: 0,
          })),
        })}
        deltas={null}
        series={null}
        range="24h"
        boothId="all"
        pro={false}
        speed={{ avgWaitSeconds: 90, series: null, peakThroughput: 0 }}
      />,
    );
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    // 24h range collapses to the friendlier "today" caption.
    expect(screen.getByText("today")).toBeInTheDocument();
    expect(screen.getByText("Best seller")).toBeInTheDocument();
    expect(screen.getByText("Avg wait")).toBeInTheDocument();
    expect(screen.getByText(/upgrade/i)).toBeInTheDocument();
  });

  it("renders the all-time totals band, distinct from the range KPIs", () => {
    render(
      <StatsView
        summary={summary()}
        deltas={null}
        series={null}
        range="7d"
        boothId="all"
        pro
        allTime={{ orders: 512, revenue_cents: 1234500 }}
      />,
    );
    // Lifetime band: its own header + labels, not the range revenue ($100.00).
    expect(screen.getByText("Since you started")).toBeInTheDocument();
    expect(screen.getByText("Total orders")).toBeInTheDocument();
    expect(screen.getByText("512")).toBeInTheDocument();
    expect(screen.getByText("Total earned")).toBeInTheDocument();
    expect(screen.getByText("$12,345.00")).toBeInTheDocument();
  });

  it("hides the all-time band when there are no lifetime orders", () => {
    render(
      <StatsView
        summary={summary()}
        deltas={null}
        series={null}
        range="7d"
        boothId="all"
        pro
        allTime={{ orders: 0, revenue_cents: 0 }}
      />,
    );
    expect(screen.queryByText("Since you started")).not.toBeInTheDocument();
  });
});

describe("waitClock", () => {
  it("shows bare seconds under a minute", () => {
    expect(waitClock(0)).toBe("0s");
    expect(waitClock(59)).toBe("59s");
  });

  it("floors minutes off the rounded total (no over-rounding)", () => {
    expect(waitClock(60)).toBe("1m 0s");
    expect(waitClock(110)).toBe("1m 50s"); // not "2m 50s"
    expect(waitClock(119)).toBe("1m 59s");
  });

  it("rounds fractional seconds without a 60s carry", () => {
    expect(waitClock(119.6)).toBe("2m 0s"); // rounds to 120, not "1m 60s"
  });
});

describe("fmtWait", () => {
  it("shows whole seconds under a minute", () => {
    expect(fmtWait(0)).toBe("0s");
    expect(fmtWait(45)).toBe("45s");
    expect(fmtWait(59)).toBe("59s");
  });

  it("shows one-decimal minutes at/over a minute", () => {
    expect(fmtWait(60)).toBe("1.0m");
    expect(fmtWait(252)).toBe("4.2m");
  });
});
