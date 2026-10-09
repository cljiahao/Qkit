// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { gate, fixtures, from, predicates, names } = vi.hoisted(() => ({
  gate: vi.fn(),
  fixtures: {} as Record<string, unknown>,
  from: vi.fn(),
  predicates: vi.fn(),
  names: vi.fn(),
}));
vi.mock("@/lib/admin/access", () => ({ requireAdmin: gate }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ from }),
  createServiceClient: async () => ({ schema: () => ({ from }) }),
}));
vi.mock("@/lib/admin/vendor-names", () => ({ vendorStallNames: names }));
import FeedbackPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  gate.mockResolvedValue({ id: "admin" });
  names.mockResolvedValue(
    new Map([
      ["a", "Coffee"],
      ["b", "Tea"],
    ]),
  );
  for (const key of Object.keys(fixtures)) delete fixtures[key];
  from.mockImplementation((table: string) => {
    const result = { data: fixtures[table] ?? null };
    const chain = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: (column: string, value: string) => {
        predicates(table, column, value);
        return chain;
      },
      then: <T,>(resolve: (value: typeof result) => T) =>
        Promise.resolve(result).then(resolve),
    };
    return chain;
  });
});
const created_at = "2026-10-01T12:00:00Z";
const customer = (
  rating: number | null,
  booth_id: string | null = "booth-a",
) => ({
  source: "customer",
  rating,
  booth_id,
  message: "Private customer review",
  created_at,
});

describe("admin feedback privacy and summaries", () => {
  it("requires authorization before any privileged query", async () => {
    gate.mockRejectedValue(new Error("Denied"));
    await expect(FeedbackPage()).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
  });
  it("handles absent feedback and restricts shared feedback to qkit", async () => {
    render(await FeedbackPage());
    expect(screen.getByText("0 responses")).toBeInTheDocument();
    expect(screen.getByText("0 ratings")).toBeInTheDocument();
    expect(
      screen.queryByText("Satisfaction by vendor"),
    ).not.toBeInTheDocument();
    expect(predicates).toHaveBeenCalledWith(
      "vendor_feedback",
      "kit_slug",
      "qkit",
    );
  });
  it("shows vendor NPS notes while keeping individual customer comments private", async () => {
    fixtures.vendor_feedback = [
      { id: "1", nps: 10, message: "Useful vendor tools", created_at },
      { id: "2", nps: 7, message: "   ", created_at },
      { id: "3", nps: 2, message: null, created_at },
      { id: "4", nps: null, message: "Comment only", created_at },
    ];
    fixtures.feedback = [
      customer(5),
      customer(3),
      customer(null),
      customer(4, null),
      customer(4, "unknown"),
      { ...customer(1), source: "vendor" },
    ];
    fixtures.booths = [{ id: "booth-a", vendor_id: "a" }];
    fixtures.vendors = [{ id: "a" }];
    render(await FeedbackPage());
    expect(screen.getByText("Useful vendor tools")).toBeInTheDocument();
    expect(screen.getByText("Comment only")).toBeInTheDocument();
    expect(
      screen.queryByText("Private customer review"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("3 responses")).toBeInTheDocument();
    expect(screen.getByText("4 ratings")).toBeInTheDocument();
    expect(screen.getByText("Coffee")).toBeInTheDocument();
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });
  it("orders vendor ratings by lowest score then largest sample, with a safe missing name", async () => {
    fixtures.vendor_feedback = [{ id: "1", nps: 9, message: null, created_at }];
    fixtures.booths = [
      { id: "booth-a", vendor_id: "a" },
      { id: "booth-b", vendor_id: "b" },
      { id: "booth-c", vendor_id: "missing" },
    ];
    fixtures.vendors = [{ id: "a" }, { id: "b" }];
    fixtures.feedback = [
      customer(5),
      customer(2, "booth-b"),
      customer(2, "booth-c"),
      customer(2, "booth-c"),
    ];
    render(await FeedbackPage());
    expect(screen.getByText("1 response")).toBeInTheDocument();
    const unknown = screen.getByText("Unknown vendor");
    const tea = screen.getByText("Tea");
    const coffee = screen.getByText("Coffee");
    expect(
      unknown.compareDocumentPosition(tea) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      tea.compareDocumentPosition(coffee) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
  it("uses singular rating copy for one customer", async () => {
    fixtures.feedback = [customer(5)];
    render(await FeedbackPage());
    expect(screen.getByText("1 rating")).toBeInTheDocument();
  });
});
