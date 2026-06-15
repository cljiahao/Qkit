// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeaturedBooths } from "./featured-booths";

describe("FeaturedBooths (seam)", () => {
  it("renders nothing when there are no featured booths", () => {
    const { container } = render(<FeaturedBooths featured={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders quotes when featured booths are supplied", () => {
    render(
      <FeaturedBooths
        featured={[
          { name: "Kopitiam Cart", quote: "Orders just appear.", by: "Ada" },
        ]}
      />,
    );
    expect(screen.getByText(/Orders just appear/)).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });
});
