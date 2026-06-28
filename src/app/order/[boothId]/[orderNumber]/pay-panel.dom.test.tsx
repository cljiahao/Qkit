// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PayPanel } from "./pay-panel";

vi.mock("./payment-actions", () => ({
  claimPayment: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("PayPanel", () => {
  it("shows a QR and, after I've paid, a claimed state", async () => {
    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        checkout={{ type: "qr", payload: "00020101" }}
        initialStatus="pending"
      />,
    );
    expect(screen.getByText(/scan to pay/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /i've paid/i }));
    await waitFor(() =>
      expect(screen.getByText(/payment sent/i)).toBeInTheDocument(),
    );
  });

  it("renders a pay link for a link checkout", () => {
    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        checkout={{ type: "link", url: "https://a.b", label: "PayLah" }}
        initialStatus="pending"
      />,
    );
    expect(screen.getByRole("link", { name: /PayLah/ })).toHaveAttribute(
      "href",
      "https://a.b",
    );
  });

  it("renders nothing once confirmed", () => {
    const { container } = render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        checkout={{ type: "qr", payload: "x" }}
        initialStatus="confirmed"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
