// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { setPlan, grant, revoke, refresh, toast } = vi.hoisted(() => ({
  setPlan: vi.fn(),
  grant: vi.fn(),
  revoke: vi.fn(),
  refresh: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("./actions", () => ({
  setVendorPlan: setPlan,
  grantPass: grant,
  revokePass: revoke,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast }));
import { VendorManage, type AdminVendorRow } from "./vendor-manage";
const vendor: AdminVendorRow = {
  id: "vendor-a",
  name: "Coffee vendor",
  plan: "free",
  created_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  setPlan.mockResolvedValue({ success: true });
  grant.mockResolvedValue({ success: true });
  revoke.mockResolvedValue({ success: true });
});

function field(name: string, value: string) {
  fireEvent.change(screen.getByTitle(name), { target: { value } });
}

describe("vendor administration", () => {
  it("grants a paid pass using SGT midnight, integer cents and trimmed note", async () => {
    render(<VendorManage vendor={vendor} />);
    field("Start date (blank = now)", "2026-10-10");
    field("Number of days", "3");
    field("What you collected (blank/0 = free comp)", "12.50");
    fireEvent.change(
      screen.getByPlaceholderText("Payment note (e.g. PayNow ref)"),
      { target: { value: "  payment-ref  " } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Grant pass" }));
    await waitFor(() =>
      expect(grant).toHaveBeenCalledWith({
        vendorId: "vendor-a",
        days: 3,
        validFromIso: "2026-10-09T16:00:00.000Z",
        amountCents: 1250,
        note: "payment-ref",
      }),
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByTitle("Number of days")).toHaveValue("1");
    expect(
      screen.getByTitle("What you collected (blank/0 = free comp)"),
    ).toHaveValue("");
  });
  it("permits an explicit free pass starting now", async () => {
    render(<VendorManage vendor={vendor} />);
    fireEvent.click(screen.getByRole("button", { name: "Grant pass" }));
    await waitFor(() =>
      expect(grant).toHaveBeenCalledWith({
        vendorId: "vendor-a",
        days: 1,
        validFromIso: undefined,
        note: undefined,
        amountCents: 0,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "Coffee vendor → 1-day pass · free",
    );
  });
  it.each(["0", "-1", "invalid"])(
    "rejects invalid pass length %s without a mutation",
    (days) => {
      render(<VendorManage vendor={vendor} />);
      field("Number of days", days);
      fireEvent.click(screen.getByRole("button", { name: "Grant pass" }));
      expect(toast.error).toHaveBeenCalledWith("Enter days (1+)");
      expect(grant).not.toHaveBeenCalled();
    },
  );
  it("retains entered data when a pass cannot be granted", async () => {
    grant.mockResolvedValue({ success: false, error: "Could not grant pass" });
    render(<VendorManage vendor={vendor} />);
    field("Number of days", "4");
    fireEvent.click(screen.getByRole("button", { name: "Grant pass" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not grant pass"),
    );
    expect(screen.getByTitle("Number of days")).toHaveValue("4");
    expect(refresh).not.toHaveBeenCalled();
  });
  it("records the entered payment when making a vendor Pro", async () => {
    render(<VendorManage vendor={vendor} />);
    field("What you collected (blank/0 = free comp)", "15");
    fireEvent.click(screen.getByRole("button", { name: "Make Pro" }));
    await waitFor(() =>
      expect(setPlan).toHaveBeenCalledWith({
        vendorId: "vendor-a",
        plan: "pro",
        amountCents: 1500,
        note: undefined,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Coffee vendor → pro · $15.00");
  });
  it("allows downgrading a Pro vendor", async () => {
    render(<VendorManage vendor={{ ...vendor, plan: "pro" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Downgrade" }));
    await waitFor(() =>
      expect(setPlan).toHaveBeenCalledWith({
        vendorId: "vendor-a",
        plan: "free",
        amountCents: 0,
        note: undefined,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Coffee vendor → free");
  });
  it("surfaces plan-change failures without refreshing stale success", async () => {
    setPlan.mockResolvedValue({
      success: false,
      error: "Could not update plan",
    });
    render(<VendorManage vendor={vendor} />);
    fireEvent.click(screen.getByRole("button", { name: "Make Pro" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not update plan"),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
  it("exposes revoke only for a live pass and refreshes after revocation", async () => {
    render(
      <VendorManage
        vendor={{ ...vendor, passExpiresAt: "2099-01-01T00:00:00Z" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Revoke pass" }));
    await waitFor(() =>
      expect(revoke).toHaveBeenCalledWith({ vendorId: "vendor-a" }),
    );
    expect(toast.success).toHaveBeenCalledWith("Coffee vendor → pass revoked");
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("does not offer revocation for expired passes", () => {
    render(
      <VendorManage
        vendor={{ ...vendor, passExpiresAt: "2000-01-01T00:00:00Z" }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Revoke pass" }),
    ).not.toBeInTheDocument();
  });
  it("shows revocation failures without a success message", async () => {
    revoke.mockResolvedValue({
      success: false,
      error: "Could not revoke pass",
    });
    render(
      <VendorManage
        vendor={{ ...vendor, passExpiresAt: "2099-01-01T00:00:00Z" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Revoke pass" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not revoke pass"),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
  it("does not silently treat malformed payment input as a free grant", () => {
    render(<VendorManage vendor={vendor} />);
    field("What you collected (blank/0 = free comp)", "12.invalid");
    fireEvent.click(screen.getByRole("button", { name: "Grant pass" }));
    expect(grant).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Enter a valid payment amount");
  });
});
