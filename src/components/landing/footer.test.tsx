// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Footer } from "./footer";

describe("Footer", () => {
  it("renders the wordmark, tagline, copyright line, and sign-in link", () => {
    render(<Footer />);

    expect(
      screen.getByRole("link", { name: "qkit home, back to top" }),
    ).toHaveAttribute("href", "/#top");
    expect(
      screen.getByText("Built for booths. Made in Singapore."),
    ).toBeInTheDocument();
    expect(screen.getByText("© 2026 qkit · a Merqo kit")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Vendor sign in →" }),
    ).toHaveAttribute("href", "/login");
  });

  it("links to the About page", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute(
      "href",
      "/about",
    );
  });

  it("links to the Terms and Privacy pages", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/legal/terms",
    );
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/legal/privacy",
    );
  });
});
