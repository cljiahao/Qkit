// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AboutPage from "./page";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => Promise.resolve({ auth: { getUser } }),
}));

describe("AboutPage", () => {
  it("renders the Merqo origin story and a link back to how qkit works", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    render(await AboutPage());

    expect(screen.getByText("Why Merqo")).toBeInTheDocument();
    expect(
      screen.getByText(/wedding, in the queue for a coffee cart/),
    ).toBeInTheDocument();
    expect(screen.getByText(/reading this on qkit/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "See how qkit works" }),
    ).toHaveAttribute("href", "/#how");
  });

  it("shows the Dashboard nav link for a signed-in vendor", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "vendor@example.com" } },
    });

    render(await AboutPage());

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});
