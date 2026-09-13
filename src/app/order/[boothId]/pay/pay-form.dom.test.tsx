// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PayForm } from "./pay-form";

const { claimPaymentMock, pushMock, refreshMock } = vi.hoisted(() => ({
  claimPaymentMock: vi.fn(),
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("../[orderNumber]/payment-actions", () => ({
  claimPayment: claimPaymentMock,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const QR_CHECKOUT = { type: "qr" as const, transactionId: "tx", payload: "p" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PayForm", () => {
  it("shows a load-failure state and no claim button when checkout is null", () => {
    render(
      <PayForm boothId="b1" token="t1" amountCents={550} checkout={null} />,
    );
    expect(screen.getByText(/couldn't load payment/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /i've paid/i }),
    ).not.toBeInTheDocument();
  });

  it("refreshes the page from the load-failure state", async () => {
    const user = userEvent.setup();
    render(
      <PayForm boothId="b1" token="t1" amountCents={550} checkout={null} />,
    );
    await user.click(screen.getByRole("button", { name: /refresh/i }));
    expect(refreshMock).toHaveBeenCalled();
  });

  it("requires a photo before submitting the claim", async () => {
    const user = userEvent.setup();
    render(
      <PayForm
        boothId="b1"
        token="t1"
        amountCents={550}
        checkout={QR_CHECKOUT}
      />,
    );
    await user.click(screen.getByRole("button", { name: /i've paid/i }));
    expect(screen.getByText(/screenshot is required/i)).toBeInTheDocument();
    expect(claimPaymentMock).not.toHaveBeenCalled();
  });

  it("uploads the photo, calls claimPayment, and redirects to the numbered order page on success", async () => {
    claimPaymentMock.mockResolvedValueOnce({
      success: true,
      orderNumber: "0007",
    });
    const user = userEvent.setup();
    render(
      <PayForm
        boothId="b1"
        token="t1"
        amountCents={550}
        checkout={QR_CHECKOUT}
      />,
    );
    const file = new File(["x"], "proof.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/upload/i), file);
    await user.click(screen.getByRole("button", { name: /i've paid/i }));
    expect(claimPaymentMock).toHaveBeenCalledWith("b1", "t1", file);
    expect(pushMock).toHaveBeenCalledWith("/order/b1/0007?t=t1");
  });

  it("shows a toast and does not redirect when claimPayment fails", async () => {
    claimPaymentMock.mockResolvedValueOnce({
      success: false,
      error: "Could not record payment. Try again.",
    });
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(
      <PayForm
        boothId="b1"
        token="t1"
        amountCents={550}
        checkout={QR_CHECKOUT}
      />,
    );
    const file = new File(["x"], "proof.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/upload/i), file);
    await user.click(screen.getByRole("button", { name: /i've paid/i }));
    expect(toast.error).toHaveBeenCalledWith(
      "Could not record payment. Try again.",
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("renders the amount and QR for a qr checkout", () => {
    render(
      <PayForm
        boothId="b1"
        token="t1"
        amountCents={800}
        checkout={QR_CHECKOUT}
      />,
    );
    expect(screen.getByText(/scan with your paynow/i)).toBeInTheDocument();
    expect(screen.getByText("$8.00")).toBeInTheDocument();
  });

  it("renders a pay link for a link checkout", () => {
    render(
      <PayForm
        boothId="b1"
        token="t1"
        amountCents={500}
        checkout={{
          type: "link",
          transactionId: "tx",
          url: "https://a.b",
          label: "PayLah",
        }}
      />,
    );
    expect(screen.getByRole("link", { name: /PayLah/ })).toHaveAttribute(
      "href",
      "https://a.b",
    );
  });
});
