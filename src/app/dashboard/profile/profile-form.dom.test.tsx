// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateStallName = vi.fn();
const updateSocialLinks = vi.fn();
vi.mock("./actions", () => ({
  updateStallName: (...args: unknown[]) => updateStallName(...args),
  updateSocialLinks: (...args: unknown[]) => updateSocialLinks(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { updateUser: vi.fn() } }),
}));

import { ProfileForm } from "./profile-form";

beforeEach(() => {
  updateStallName.mockReset();
  updateSocialLinks.mockReset();
});

describe("ProfileForm social links", () => {
  const baseProps = {
    stallName: "Kopitiam Cart",
    displayName: "",
    email: "a@b.com",
    vendorId: "v1",
    avatarUrl: null,
    socialLinks: {},
  };

  it("rejects a non-http website before calling the action", async () => {
    const user = userEvent.setup();
    render(<ProfileForm {...baseProps} />);

    await user.type(screen.getByLabelText(/website/i), "not-a-url");
    await user.click(screen.getByRole("button", { name: /save links/i }));

    expect(screen.getByText(/must be an http\(s\) link/i)).toBeInTheDocument();
    expect(updateSocialLinks).not.toHaveBeenCalled();
  });

  it("saves valid links", async () => {
    updateSocialLinks.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<ProfileForm {...baseProps} />);

    await user.type(
      screen.getByLabelText(/instagram/i),
      "https://instagram.com/kopitiam",
    );
    await user.click(screen.getByRole("button", { name: /save links/i }));

    expect(updateSocialLinks).toHaveBeenCalledWith({
      instagram: "https://instagram.com/kopitiam",
    });
  });
});
