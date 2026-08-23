// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrintingSection } from "./printing-section";

describe("PrintingSection", () => {
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
});
