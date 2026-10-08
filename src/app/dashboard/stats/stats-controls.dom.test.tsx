// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatsControls } from "./stats-controls";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("StatsControls accessibility", () => {
  it("exposes the selected range and the booth filter name", () => {
    render(
      <StatsControls
        range="7d"
        booth="all"
        allowedRanges={["24h", "7d"]}
        booths={[
          { id: "a", name: "Tea" },
          { id: "b", name: "Coffee" },
        ]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "7 days", pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "24h", pressed: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filter by booth" }),
    ).toBeInTheDocument();
  });
});
