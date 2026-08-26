// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StuckOrdersSection } from "./stuck-orders-section";
import type { StuckOrder } from "@/lib/stuck-orders";

const order = (overrides: Partial<StuckOrder> = {}): StuckOrder => ({
  id: "o1",
  booth_id: "b1",
  status: "preparing",
  status_since: "2026-06-11T11:00:00Z",
  stuckForMs: 42 * 60_000,
  ...overrides,
});

describe("StuckOrdersSection", () => {
  it("renders nothing when there are no stuck orders", () => {
    const { container } = render(
      <StuckOrdersSection stuckOrders={[]} boothNameById={new Map()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the count, booth name, status, and elapsed time for each stuck order", () => {
    render(
      <StuckOrdersSection
        stuckOrders={[order()]}
        boothNameById={new Map([["b1", "Kopitiam Cart"]])}
      />,
    );
    expect(screen.getByText("Stuck orders · 1")).toBeInTheDocument();
    expect(screen.getByText("Kopitiam Cart")).toBeInTheDocument();
    expect(screen.getByText(/stuck since/i)).toHaveTextContent(
      "Stuck since 42 min ago",
    );
    expect(screen.getByText("Preparing")).toBeInTheDocument();
  });

  it("falls back to 'Unknown booth' when the booth id has no name", () => {
    render(
      <StuckOrdersSection stuckOrders={[order()]} boothNameById={new Map()} />,
    );
    expect(screen.getByText("Unknown booth")).toBeInTheDocument();
  });
});
