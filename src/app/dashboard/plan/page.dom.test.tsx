// @vitest-environment jsdom
//
// Follows the pattern established in
// src/app/order/[boothId]/[orderNumber]/page.dom.test.tsx: page.tsx is a
// plain async function with no RSC-specific machinery, so it can be awaited
// directly and its returned element tree rendered like any other component.
// requireEntitledVendor and the pricing-row read are mocked; this test
// asserts the feature-comparison grid renders correctly through the shared
// PlanComparisonTable (@merqo/ui) — same visible behavior (column order,
// check/dash rendering, row order) the old local FEATURES/Cell markup had,
// verified against the new render path.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, within } from "@testing-library/react";
import PlanPage from "./page";

// The tier badge at the top of the page ("Free"/"Event pass"/"Pro") can
// share text with the grid's own tier column headers (most notably "Free"
// on the free tier), so every assertion below is scoped to the grid's own
// container rather than the whole page.
function getGrid(container: HTMLElement) {
  const grid = container.querySelector(".overflow-hidden.rounded-2xl.border");
  if (!grid) throw new Error("comparison grid container not found");
  return within(grid as HTMLElement);
}

const { requireEntitledVendor } = vi.hoisted(() => ({
  requireEntitledVendor: vi.fn(),
}));

vi.mock("@/lib/supabase/get-entitlement", () => ({ requireEntitledVendor }));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () =>
    Promise.resolve({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
        }),
      }),
    }),
}));

function entitlement(tier: "free" | "pass" | "pro") {
  return {
    entitlement: { tier },
    licenseExpiresAt: null,
  };
}

beforeEach(() => {
  requireEntitledVendor.mockReset();
});

describe("PlanPage — feature comparison grid", () => {
  it("renders the Free/Pass/Pro header columns via PlanComparisonTable", async () => {
    requireEntitledVendor.mockResolvedValue(entitlement("free"));
    const { container } = render(await PlanPage());
    const grid = getGrid(container);

    expect(grid.getByText("Feature")).toBeInTheDocument();
    expect(grid.getByText("Free")).toBeInTheDocument();
    expect(grid.getByText("Pass")).toBeInTheDocument();
    expect(grid.getByText("Pro")).toBeInTheDocument();
  });

  it("renders every FEATURES row label, in order, with the right check/dash cells", async () => {
    requireEntitledVendor.mockResolvedValue(entitlement("free"));
    const { container } = render(await PlanPage());
    const grid = getGrid(container);

    const rowLabels = [
      "Live order board",
      "QR posters",
      "Up to 6 menu items",
      "Unlimited items & customization",
      "Extra booths",
      "Scheduled auto-close hours",
      "Sold-out stock caps",
      "This event's stats",
      "Full history & trends (7/30/90d)",
    ];
    const rowDivs = Array.from(
      container.querySelectorAll(
        ".overflow-hidden.rounded-2xl.border > .border-t",
      ),
    );
    expect(rowDivs.map((el) => el.querySelector("span")?.textContent)).toEqual(
      rowLabels,
    );

    // "Extra booths": free=false, pass=true, pro=true -> one dash, two checks.
    const extraBoothsRow = grid.getByText("Extra booths").closest("div");
    expect(extraBoothsRow?.querySelectorAll("svg").length).toBe(2);
    expect(extraBoothsRow?.textContent).toContain("-");

    // "Live order board": all three true -> three checks, no dash text node.
    const liveBoardRow = grid.getByText("Live order board").closest("div");
    expect(liveBoardRow?.querySelectorAll("svg").length).toBe(3);

    // "Full history & trends (7/30/90d)": free=false, pass=false, pro=true.
    const historyRow = grid
      .getByText("Full history & trends (7/30/90d)")
      .closest("div");
    expect(historyRow?.querySelectorAll("svg").length).toBe(1);
  });
});
