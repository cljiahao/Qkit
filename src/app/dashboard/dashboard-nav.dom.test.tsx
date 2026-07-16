// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardNav } from "./dashboard-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

describe("DashboardNav", () => {
  const baseProps = {
    signOut: vi.fn(async () => {}),
    vendorName: "Kopi Corner",
    avatarUrl: null,
    tier: "free" as const,
  };

  it("renders Orders, Completed, Booths, and Stats as inline nav links, with no Plan link", () => {
    render(<DashboardNav {...baseProps} />);
    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: "Completed" })).toHaveAttribute(
      "href",
      "/dashboard/completed",
    );
    expect(screen.getByRole("link", { name: "Booths" })).toHaveAttribute(
      "href",
      "/dashboard/booths",
    );
    expect(screen.getByRole("link", { name: "Stats" })).toHaveAttribute(
      "href",
      "/dashboard/stats",
    );
    expect(
      screen.queryByRole("link", { name: "Plan" }),
    ).not.toBeInTheDocument();
  });

  it("account menu has Profile, Board settings, Plan, Get help, Feedback (in that order), then Sign out", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    const accountButton = screen.getByRole("button", {
      name: /account menu/i,
    });
    await user.click(accountButton);

    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems.map((item) => item.textContent)).toEqual([
      "Profile",
      "Board settings",
      "Plan",
      "Get help",
      "Feedback",
      "Sign out",
    ]);
    expect(screen.getByRole("menuitem", { name: "Plan" })).toHaveAttribute(
      "href",
      "/dashboard/plan",
    );
  });
});
