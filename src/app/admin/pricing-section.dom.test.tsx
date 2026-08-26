// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { toast } from "sonner";

const { setPricingMock } = vi.hoisted(() => ({ setPricingMock: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./actions", () => ({ setPricing: setPricingMock }));

import { PricingSection } from "./pricing-section";

beforeEach(() => {
  setPricingMock.mockReset();
});

const initial = {
  event_pass_cents: 1000,
  monthly_cents: 4999,
  currency: "SGD",
};

describe("PricingSection", () => {
  it("submits both edited prices as cents and toasts success", async () => {
    setPricingMock.mockResolvedValue({ success: true });
    render(<PricingSection initial={initial} />);
    fireEvent.change(screen.getByLabelText(/event pass/i), {
      target: { value: "12.00" },
    });
    fireEvent.change(screen.getByLabelText(/monthly/i), {
      target: { value: "59.99" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(setPricingMock).toHaveBeenCalledWith({
        event_pass_cents: 1200,
        monthly_cents: 5999,
      }),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("toasts an error when the action returns failure", async () => {
    setPricingMock.mockResolvedValue({
      success: false,
      error: "Could not update pricing",
    });
    render(<PricingSection initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not update pricing"),
    );
  });
});
