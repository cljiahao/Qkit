// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("renders the label and the page title as the only h1", () => {
    render(<PageHeader eyebrow="Order history" title="Completed orders" />);
    expect(screen.getByText("Order history")).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 1, name: "Completed orders" }),
    ).toBeVisible();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("renders a description only when one is given", () => {
    const { rerender } = render(<PageHeader eyebrow="Billing" title="Plan" />);
    expect(document.querySelectorAll("p")).toHaveLength(1);
    rerender(
      <PageHeader eyebrow="Billing" title="Plan">
        What you pay for.
      </PageHeader>,
    );
    expect(screen.getByText("What you pay for.")).toBeVisible();
  });

  it("adds no wrapper, so a page keeps its own layout around it", () => {
    const { container } = render(<PageHeader eyebrow="Billing" title="Plan" />);
    expect(container.children).toHaveLength(2);
    expect(container.children[0].tagName).toBe("P");
    expect(container.children[1].tagName).toBe("H1");
  });

  it("steps the title down on a phone only when asked to", () => {
    const { rerender } = render(<PageHeader eyebrow="x" title="Booths" />);
    expect(screen.getByRole("heading")).toHaveClass("text-4xl");
    expect(screen.getByRole("heading")).not.toHaveClass("text-3xl");
    rerender(<PageHeader eyebrow="x" title="Booths" responsive />);
    expect(screen.getByRole("heading")).toHaveClass("text-3xl", "sm:text-4xl");
  });
});
