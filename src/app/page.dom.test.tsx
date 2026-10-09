// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
const { getUser, pricing, nav } = vi.hoisted(() => ({
  getUser: vi.fn(),
  pricing: vi.fn(),
  nav: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: pricing }) }) }),
  }),
}));
vi.mock("@/components/landing/nav", () => ({
  Nav: (props: unknown) => {
    nav(props);
    return null;
  },
}));
vi.mock("@/components/landing/footer", () => ({ Footer: () => null }));
vi.mock("@/components/hero-preview-carousel", () => ({
  HeroPreviewCarousel: () => null,
}));
vi.mock("@/components/landing-cta", () => ({
  LandingCta: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@merqo/ui", async (original) => ({
  ...(await original<typeof import("@merqo/ui")>()),
  BackToTop: () => null,
}));
import LandingPage from "./page";
beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: null } });
  pricing.mockResolvedValue({ data: null });
});

describe("public landing page", () => {
  it("offers signup with fallback pricing when no pricing row exists", async () => {
    render(await LandingPage());
    for (const link of screen.getAllByRole("link", { name: "Get started" }))
      expect(link).toHaveAttribute("href", "/login?mode=signup");
    expect(nav).toHaveBeenCalledWith({ authed: false });
    expect(
      screen.getByRole("heading", { name: "Troubleshooting" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/That button only flags the order as Says paid/),
    ).toBeInTheDocument();
  });
  it("takes an authenticated vendor to their dashboard", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "vendor" } } });
    render(await LandingPage());
    for (const link of screen.getAllByRole("link", { name: "Go to dashboard" }))
      expect(link).toHaveAttribute("href", "/dashboard");
    expect(nav).toHaveBeenCalledWith({ authed: true });
  });
  it("shows explicit beta availability when both paid prices are unset", async () => {
    pricing.mockResolvedValue({
      data: { event_pass_cents: 0, monthly_cents: 0, currency: "SGD" },
    });
    render(await LandingPage());
    expect(screen.getByText("Free in beta")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Free while we're in beta. Ask for a pass to unlock the full kit for your next event.",
      ),
    ).toBeInTheDocument();
  });
  it.each([
    [1200, 2500],
    [0, 2500],
    [1200, 0],
  ])(
    "renders independently configured pass/month prices %s/%s",
    async (event_pass_cents, monthly_cents) => {
      pricing.mockResolvedValue({
        data: { event_pass_cents, monthly_cents, currency: "SGD" },
      });
      render(await LandingPage());
      if (event_pass_cents)
        expect(screen.getByText("$12.00")).toBeInTheDocument();
      if (monthly_cents) expect(screen.getByText("$25.00")).toBeInTheDocument();
      expect(
        screen.getByText(/Founding price for early vendors/),
      ).toBeInTheDocument();
    },
  );
});
