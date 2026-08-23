// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoothForm } from "./booth-form";
import type { Entitlement } from "@/lib/plan";

const { saveBooth, deleteBooth } = vi.hoisted(() => ({
  saveBooth: vi.fn(),
  deleteBooth: vi.fn(),
}));
vi.mock("./actions", () => ({ saveBooth, deleteBooth }));

// Every subcomponent below has its own dom test file — stub them out here so
// this file is isolated to booth-form's own state wiring (in particular the
// walk-up-default toggle), not their internals.
vi.mock("./menu-editor", () => ({ MenuEditor: () => null }));
vi.mock("./working-hours-editor", () => ({ WorkingHoursEditor: () => null }));
vi.mock("./payment-section", () => ({ PaymentSection: () => null }));
vi.mock("./social-links-section", () => ({ SocialLinksSection: () => null }));
vi.mock("./close-booth-control", () => ({ CloseBoothControl: () => null }));
vi.mock("@merqo/ui", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ImageUploader: () => null,
}));

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }),
}));

const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
}));

const ENTITLEMENT: Entitlement = {
  tier: "free",
  maxBooths: 1,
  maxMenuItems: 6,
  maxOptionGroupsPerItem: 3,
  autoCloseHours: false,
  stockCaps: false,
  statsRanges: ["24h"],
};

const TOGGLE_LABEL = "Default to walk-up order entry";
const BOOTH_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  saveBooth.mockResolvedValue({ success: true, boothId: "b1" });
});

describe("BoothForm walk-up-default toggle", () => {
  it("starts off for a plain new booth and submits walkup_default: false", async () => {
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
      />,
    );
    const toggle = screen.getByRole("switch", { name: TOGGLE_LABEL });
    expect(toggle).not.toBeChecked();

    await user.type(screen.getByLabelText("Booth name"), "Ice Cream Cart");
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ walkup_default: false }),
    );
  });

  it("toggling it on submits walkup_default: true", async () => {
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
      />,
    );
    await user.type(screen.getByLabelText("Booth name"), "Ice Cream Cart");
    await user.click(screen.getByRole("switch", { name: TOGGLE_LABEL }));
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ walkup_default: true }),
    );
  });

  it("starts pre-checked (and shows a Recommended badge) in event mode", () => {
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        eventMode
      />,
    );
    expect(screen.getByRole("switch", { name: TOGGLE_LABEL })).toBeChecked();
    expect(screen.getByText("Recommended")).toBeInTheDocument();
  });

  it("reflects a persisted true value when editing an existing booth", () => {
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        initial={{
          boothId: BOOTH_ID,
          name: "Ice Cream Cart",
          image_url: null,
          is_active: true,
          hours: null,
          menu_items: [],
          payment: null,
          social_links: null,
          requires_arrival_confirm: false,
          walkup_default: true,
          print_enabled: false,
        }}
      />,
    );
    expect(screen.getByRole("switch", { name: TOGGLE_LABEL })).toBeChecked();
    // No Recommended badge outside the dedicated event-mode create flow.
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
  });

  it("persists an edit turning it off", async () => {
    saveBooth.mockResolvedValue({ success: true, boothId: BOOTH_ID });
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        initial={{
          boothId: BOOTH_ID,
          name: "Ice Cream Cart",
          image_url: null,
          is_active: true,
          hours: null,
          menu_items: [],
          payment: null,
          social_links: null,
          requires_arrival_confirm: false,
          walkup_default: true,
          print_enabled: false,
        }}
      />,
    );
    await user.click(screen.getByRole("switch", { name: TOGGLE_LABEL }));
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ boothId: BOOTH_ID, walkup_default: false }),
    );
    expect(toastError).not.toHaveBeenCalled();
  });
});
