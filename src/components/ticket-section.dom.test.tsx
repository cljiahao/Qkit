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
    // Radix's TooltipContent (@radix-ui/react-tooltip 1.2.8, as currently
    // pinned in qkit's lockfile) renders the tooltip text twice: once
    // visibly, and once in a visually-hidden role="tooltip" span used for
    // the accessible name. Both resolve to the same on-screen tooltip.
    // Pinned to exactly 2 (not `toBeGreaterThan(0)`) so this test actually
    // proves the visible tooltip renders on hover, not just that some
    // matching text exists somewhere (a greater-than-0 check would also
    // pass if only the visually-hidden duplicate rendered and the visible
    // content silently failed to show). If @radix-ui/react-tooltip is ever
    // bumped past 1.2.8 and this duplicate-node behavior goes away, this
    // will need to become `.toBe(1)` — do not bump the dependency to "fix"
    // this test without confirming the duplicate node is actually gone.
    const matches = await screen.findAllByText("extra detail");
    expect(matches.length).toBe(2);
  });
});
