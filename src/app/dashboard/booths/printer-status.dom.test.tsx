// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PrinterStatus } from "./printer-status";

describe("PrinterStatus", () => {
  it("shows offline when online is false", () => {
    render(<PrinterStatus online={false} />);
    expect(screen.getByText("No printer connected")).toBeInTheDocument();
    expect(
      screen.getByText(/open the bridge on your printing device/i),
    ).toBeInTheDocument();
  });

  it("shows online when online is true", () => {
    render(<PrinterStatus online={true} />);
    expect(screen.getByText("Printer connected")).toBeInTheDocument();
    expect(
      screen.queryByText(/open the bridge on your printing device/i),
    ).not.toBeInTheDocument();
  });
});
