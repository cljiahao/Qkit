// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrintingSection } from "./printing-section";

describe("PrintingSection", () => {
  const originalUrl = process.env.NEXT_PUBLIC_PRINTKIT_URL;

  afterEach(() => {
    // process.env.X = undefined stringifies to "undefined" in Node, not
    // unset — delete instead when there was nothing there to restore.
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_PRINTKIT_URL;
    else process.env.NEXT_PUBLIC_PRINTKIT_URL = originalUrl;
  });

  it("calls onChange with the new value when toggled", () => {
    const onChange = vi.fn();
    render(<PrintingSection value={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reflects a true value as checked", () => {
    render(<PrintingSection value={true} onChange={vi.fn()} />);
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("shows no printer link/hint when print_enabled is off", () => {
    render(<PrintingSection value={false} onChange={vi.fn()} boothId="b1" />);
    expect(screen.queryByText(/printer/i)).not.toBeInTheDocument();
  });

  it("prompts to save the booth first when enabled but unsaved", () => {
    render(<PrintingSection value={true} onChange={vi.fn()} />);
    expect(
      screen.getByText(
        "Save this booth first to choose its printer in printkit.",
      ),
    ).toBeInTheDocument();
  });

  it("links to printkit's bridge page for this booth, keyed by booth id", () => {
    process.env.NEXT_PUBLIC_PRINTKIT_URL = "https://printkit.test";
    render(
      <PrintingSection value={true} onChange={vi.fn()} boothId="booth-42" />,
    );
    const link = screen.getByRole("link", {
      name: "Choose the printer for this booth →",
    });
    expect(link).toHaveAttribute(
      "href",
      "https://printkit.test/dashboard/bridge?booth=booth-42",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("falls back to a not-configured hint when printkit's URL is unset", () => {
    delete process.env.NEXT_PUBLIC_PRINTKIT_URL;
    render(
      <PrintingSection value={true} onChange={vi.fn()} boothId="booth-42" />,
    );
    expect(
      screen.getByText("Printing isn't configured yet."),
    ).toBeInTheDocument();
  });

  it("shows a printkit dashboard link regardless of the switch value", () => {
    process.env.NEXT_PUBLIC_PRINTKIT_URL = "https://printkit.test";
    render(<PrintingSection value={false} onChange={vi.fn()} />);
    expect(
      screen.getByRole("link", { name: "Manage printers in printkit ↗" }),
    ).toHaveAttribute("href", "https://printkit.test/dashboard");
  });

  it("hides the printkit dashboard link when its URL is unset", () => {
    delete process.env.NEXT_PUBLIC_PRINTKIT_URL;
    render(<PrintingSection value={false} onChange={vi.fn()} />);
    expect(
      screen.queryByRole("link", { name: /manage printers/i }),
    ).not.toBeInTheDocument();
  });

  it("hides the dashboard link once the booth-scoped link is available", () => {
    process.env.NEXT_PUBLIC_PRINTKIT_URL = "https://printkit.test";
    render(
      <PrintingSection value={true} onChange={vi.fn()} boothId="booth-42" />,
    );
    expect(
      screen.getByRole("link", {
        name: "Choose the printer for this booth →",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /manage printers/i }),
    ).not.toBeInTheDocument();
  });
});
