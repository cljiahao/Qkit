// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BoothList } from "./booth-list";

const BOOTH = {
  id: "b1",
  name: "Kopi Cart",
  is_active: true,
  image_url: null,
  itemCount: 3,
  paused: false,
  shortCode: "abc123",
};

describe("BoothList", () => {
  it("links the TV display button to the booth's public display route in a new tab", () => {
    render(<BoothList booths={[BOOTH]} />);

    const link = screen.getByRole("link", { name: "Open TV display" });
    expect(link).toHaveAttribute("href", "/order/b1/display");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
