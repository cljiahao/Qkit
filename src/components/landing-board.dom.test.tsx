// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingBoard } from "./landing-board";
import { LANDING_BOARDS } from "./landing-boards";

describe("LANDING_BOARDS", () => {
  it("has the 4 expected boards", () => {
    expect(LANDING_BOARDS.map((b) => b.key)).toEqual([
      "coffee",
      "icecream",
      "payment",
      "rush",
    ]);
  });
  it("icecream board is queue-only (no ticket has a total or payment)", () => {
    const ice = LANDING_BOARDS.find((b) => b.key === "icecream")!;
    for (const t of ice.tickets) {
      expect(t.total).toBeUndefined();
      expect(t.payment).toBeUndefined();
    }
  });
  it("payment board shows a claimed and a paid ticket", () => {
    const pay = LANDING_BOARDS.find((b) => b.key === "payment")!;
    const payments = pay.tickets.map((t) => t.payment);
    expect(payments).toContain("claimed");
    expect(payments).toContain("paid");
  });
  it("rush board has an overdue ticket", () => {
    const rush = LANDING_BOARDS.find((b) => b.key === "rush")!;
    expect(rush.tickets.some((t) => t.age?.tone === "overdue")).toBe(true);
  });
});

describe("LandingBoard", () => {
  it("renders the header count and each ticket", () => {
    render(<LandingBoard board={LANDING_BOARDS[0]} />);
    expect(screen.getByText(/active/i)).toBeInTheDocument();
    expect(screen.getByText("#0042")).toBeInTheDocument();
  });
});
