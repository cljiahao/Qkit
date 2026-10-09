// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SocialLinksRow } from "./social-links-row";

describe("SocialLinksRow", () => {
  it("renders nothing when there are no links", () => {
    const { container } = render(<SocialLinksRow links={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders only the links that are set", () => {
    render(
      <SocialLinksRow
        links={{
          website: "https://a.b",
          instagram: "https://instagram.com/a",
        }}
      />,
    );
    expect(screen.getByRole("link", { name: /website/i })).toHaveAttribute(
      "href",
      "https://a.b",
    );
    expect(screen.getByRole("link", { name: /instagram/i })).toHaveAttribute(
      "href",
      "https://instagram.com/a",
    );
    expect(
      screen.queryByRole("link", { name: /facebook/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /tiktok/i }),
    ).not.toBeInTheDocument();
  });
});
