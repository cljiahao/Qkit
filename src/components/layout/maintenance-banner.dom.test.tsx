// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MaintenanceBanner } from "./maintenance-banner";

describe("MaintenanceBanner", () => {
  it("renders the message when enabled", () => {
    render(
      <MaintenanceBanner enabled message="Scheduled maintenance tonight" />,
    );
    expect(
      screen.getByText("Scheduled maintenance tonight"),
    ).toBeInTheDocument();
  });

  it("renders nothing when disabled", () => {
    const { container } = render(
      <MaintenanceBanner enabled={false} message="Should not show" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when enabled but the message is blank", () => {
    const { container } = render(<MaintenanceBanner enabled message="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
