import { describe, expect, it } from "vitest";
import {
  salesSummaryToCsv,
  toSalesSummaryV1,
  type SalesSummaryV1,
} from "./sales-summary";
import type { StatsSummary } from "./stats";

function summary(over: Partial<StatsSummary> = {}): StatsSummary {
  return {
    revenue_cents: 500,
    orderCount: 3,
    aov_cents: 167,
    cancelled: 1,
    refunds_cents: 0,
    refundCount: 0,
    fulfilmentRate: 0.75,
    topItems: [
      {
        label: "Kopi",
        quantity: 2,
        revenue_cents: 400,
        cost_cents: 100,
        profit_cents: 300,
      },
    ],
    hourly: [],
    busiestHour: null,
    dayHour: [],
    optionBreakdown: [],
    grossMargin: {
      revenue_cents: 500,
      cost_cents: 140,
      profit_cents: 360,
      marginPct: 72,
    },
    ...over,
  };
}

const meta = {
  range: "7d",
  boothId: "all",
  generatedAt: "2026-06-16T00:00:00Z",
};

describe("toSalesSummaryV1", () => {
  it("maps internal stats to the frozen v1 contract", () => {
    const out = toSalesSummaryV1(summary(), meta);
    expect(out).toEqual<SalesSummaryV1>({
      version: 1,
      generated_at: "2026-06-16T00:00:00Z",
      range: "7d",
      booth_id: "all",
      revenue_cents: 500,
      order_count: 3,
      aov_cents: 167,
      cancelled: 1,
      refunds_cents: 0,
      refund_count: 0,
      fulfilment_rate: 0.75,
      gross_margin: {
        revenue_cents: 500,
        cost_cents: 140,
        profit_cents: 360,
        margin_pct: 72,
      },
      top_items: [
        { label: "Kopi", quantity: 2, revenue_cents: 400, profit_cents: 300 },
      ],
    });
  });

  it("carries a null gross_margin when no cost data", () => {
    const out = toSalesSummaryV1(summary({ grossMargin: null }), meta);
    expect(out.gross_margin).toBeNull();
  });
});

describe("salesSummaryToCsv", () => {
  it("emits a summary block then an items table", () => {
    const csv = salesSummaryToCsv(toSalesSummaryV1(summary(), meta));
    expect(csv).toContain("Metric,Value");
    expect(csv).toContain("Revenue,5.00");
    expect(csv).toContain("Gross margin %,72");
    expect(csv).toContain("Item,Quantity,Revenue,Profit");
    expect(csv).toContain("Kopi,2,4.00,3.00");
  });

  it("quotes cells containing commas", () => {
    const csv = salesSummaryToCsv(
      toSalesSummaryV1(
        summary({
          topItems: [
            {
              label: "Kopi, Iced",
              quantity: 1,
              revenue_cents: 100,
              cost_cents: 0,
              profit_cents: 100,
            },
          ],
        }),
        meta,
      ),
    );
    expect(csv).toContain('"Kopi, Iced",1,1.00,1.00');
  });
});
