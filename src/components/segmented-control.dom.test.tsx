// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedControl } from "./segmented-control";

const OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
] as const;

describe("SegmentedControl", () => {
  it("is a labelled group with the active option pressed", () => {
    render(
      <SegmentedControl
        ariaLabel="Date range"
        options={OPTIONS}
        value="7d"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("group", { name: "Date range" })).toBeVisible();
    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("reports the option that was tapped", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedControl
        ariaLabel="Date range"
        options={OPTIONS}
        value="7d"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(onChange).toHaveBeenCalledWith("today");
  });

  it("renders an out-of-plan option as a link that does not switch", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedControl
        ariaLabel="Date range"
        value="today"
        onChange={onChange}
        options={[
          { value: "today", label: "Today" },
          {
            value: "90d",
            label: "90 days",
            lockedHref: "/dashboard/plan",
            lockedTitle: "Upgrade to unlock longer ranges",
          },
        ]}
      />,
    );
    const locked = screen.getByRole("link", { name: "90 days" });
    expect(locked).toHaveAttribute("href", "/dashboard/plan");
    expect(locked).toHaveAttribute("title", "Upgrade to unlock longer ranges");
    expect(
      screen.queryByRole("button", { name: "90 days" }),
    ).not.toBeInTheDocument();
    await user.click(locked);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("is finger-sized on a touch screen at either size", () => {
    const { rerender } = render(
      <SegmentedControl
        ariaLabel="Date range"
        options={OPTIONS}
        value="7d"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Today" })).toHaveClass(
      "[@media(pointer:coarse)]:min-h-11",
    );
    rerender(
      <SegmentedControl
        ariaLabel="Date range"
        size="sm"
        options={OPTIONS}
        value="7d"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Today" })).toHaveClass(
      "[@media(pointer:coarse)]:min-h-11",
    );
  });
});
