// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiRow } from "./kpi-row";
import { MarginTable } from "./margin-table";
import { ServiceSpeedChart } from "./service-speed-chart";
import type { StatsSummary } from "@/lib/stats";

function summary(over: Partial<StatsSummary> = {}): StatsSummary {
  return {
    revenue_cents: 10000,
    orderCount: 20,
    aov_cents: 500,
    cancelled: 2,
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
