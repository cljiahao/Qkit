// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  groupReviewsByBooth,
  summarizeReviews,
  type ReviewRow,
} from "@/lib/reviews";
import { ReviewsCard } from "./reviews-card";

function review(
  message: string | null,
  rating: number | null = 5,
  booth = "a",
): ReviewRow {
  return {
    message,
    rating,
    booth_id: booth,
    order_number: null,
    created_at: "2026-10-01T12:00:00Z",
  };
}
function props(rows: ReviewRow[] = []) {
  return {
    groups: groupReviewsByBooth(rows, [
      { id: "a", name: "Coffee" },
      { id: "b", name: "Tea" },
    ]),
    overall: summarizeReviews(rows),
    selected: "all",
  };
}

describe("customer reviews", () => {
  it("explains empty aggregate and missing booth states", () => {
    const view = render(<ReviewsCard {...props()} />);
    expect(screen.getByText(/No customer feedback yet/)).toBeInTheDocument();
    view.rerender(<ReviewsCard {...props()} selected="missing" />);
    expect(
      screen.getByText("No reviews for this booth yet."),
    ).toBeInTheDocument();
  });
  it("preserves the date range when drilling into booth comparisons", () => {
    render(
      <ReviewsCard
        {...props([
          review("Good", 4),
          review("Great", 5),
          review("Thanks", null, "b"),
        ])}
        range="30d"
      />,
    );
    expect(screen.getAllByText("4.5")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Coffee/ })).toHaveAttribute(
      "href",
      "/dashboard/stats?booth=a&range=30d",
    );
    expect(screen.getByRole("link", { name: /Tea/ })).toHaveAttribute(
      "href",
      "/dashboard/stats?booth=b&range=30d",
    );
    expect(screen.getByText("2 ratings across all booths")).toBeInTheDocument();
  });
  it("supports default-range links and non-linkable event comparisons", () => {
    const data = props([review("Nice")]);
    const view = render(<ReviewsCard {...data} />);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/dashboard/stats?booth=a",
    );
    expect(screen.getByText("1 rating across all booths")).toBeInTheDocument();
    view.rerender(<ReviewsCard {...data} linkable={false} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("renders comment-only feedback without inventing a rating", () => {
    const data = props([
      review("Please add oat milk", null),
      review("  ", null),
      review(null, null),
    ]);
    const view = render(<ReviewsCard {...data} />);
    expect(screen.getByText("0 ratings across all booths")).toBeInTheDocument();
    view.rerender(<ReviewsCard {...data} selected="a" />);
    expect(screen.getByText("0 ratings")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Please add oat milk")).toBeInTheDocument();
  });
  it("pages comments and collapses them again", () => {
    render(
      <ReviewsCard
        {...props(
          Array.from({ length: 11 }, (_, i) =>
            review(`Review ${i}`, i % 2 ? 4 : 5),
          ),
        )}
        selected="a"
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Show more (6)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Show more (1)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(11);
    expect(
      screen.queryByRole("button", { name: /Show more/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });
  it("shows ratings without requiring written comments", () => {
    render(<ReviewsCard {...props([review(null, 1)])} selected="a" />);
    expect(screen.getByText("1 rating")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
