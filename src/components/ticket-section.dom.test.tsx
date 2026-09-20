// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Section } from "./ticket-section";

describe("Section", () => {
  it("renders inside a Ticket shell (scalloped-card visual class present)", () => {
    const { container } = render(
      <Section icon={<span />} title="Stall name" description="desc">
        <p>content</p>
      </Section>,
    );
    expect(container.querySelector(".ticket")).toBeInTheDocument();
  });

  it("renders the icon, title, and description via the shared Section header", () => {
    render(
      <Section
        icon={<span data-testid="my-icon" />}
        title="Stall name"
        description="desc"
      >
        <p>content</p>
      </Section>,
    );
    expect(screen.getByTestId("my-icon")).toBeInTheDocument();
    expect(screen.getByText("Stall name")).toBeInTheDocument();
    expect(screen.getByText("desc")).toBeInTheDocument();
  });

  it("renders a tooltip via the shared Section header when tooltip is set", async () => {
    const user = userEvent.setup();
    render(
      <Section
        icon={<span />}
        title="Stall name"
        description="desc"
        tooltip="extra detail"
      >
        <p>content</p>
      </Section>,
    );
    await user.hover(
      screen.getByRole("button", { name: /more about stall name/i }),
    );
    // Radix's TooltipContent used to render the tooltip text twice: once
    // visibly, and once in a visually-hidden role="tooltip" span for the
    // accessible name. That duplicate is gone as of the 1.2.16 that
    // @merqo/ui v0.31.x bundles, so exactly one node is now correct.
    // Verified, per the previous comment's own instruction, that the
    // surviving node is the visible one and not the hidden duplicate: it
    // carries role="tooltip", data-state="delayed-open", the popper
    // positioning styles and the real bg-popover classes. Still pinned to
    // an exact count rather than `toBeGreaterThan(0)`, so this keeps
    // proving the visible tooltip actually renders on hover.
    const matches = await screen.findAllByText("extra detail");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toHaveAttribute("role", "tooltip");
    expect(matches[0]).toHaveAttribute("data-state", "delayed-open");
  });
});
