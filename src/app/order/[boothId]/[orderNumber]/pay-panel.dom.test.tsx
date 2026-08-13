// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PayPanel } from "./pay-panel";

vi.mock("./payment-actions", () => ({
  claimPayment: vi.fn().mockResolvedValue({ success: true }),
  unclaimPayment: vi.fn().mockResolvedValue({ success: true }),
  // Poll returns the same status so the effect is a no-op in tests.
  getPaymentStatus: vi.fn().mockResolvedValue("pending"),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

vi.mock("./qr-image", () => ({
  renderSvgToPngBlob: vi
    .fn()
    .mockResolvedValue(new Blob(["x"], { type: "image/png" })),
}));

describe("PayPanel", () => {
  it("shows a QR and, after I've paid, a claimed state", async () => {
    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        checkout={{ type: "qr", transactionId: "tx1", payload: "00020101" }}
        initialStatus="pending"
        amountCents={800}
      />,
    );
    expect(screen.getByText(/scan with your paynow/i)).toBeInTheDocument();
    // Amount is echoed by the QR.
    expect(screen.getByText("$8.00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /i've paid/i }));
    await waitFor(() =>
      expect(screen.getByText(/payment sent/i)).toBeInTheDocument(),
    );
  });

  it("lets the customer undo an accidental claim", async () => {
    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        checkout={{ type: "qr", transactionId: "tx1", payload: "00020101" }}
        initialStatus="claimed"
        amountCents={800}
      />,
    );
    expect(screen.getByText(/payment sent/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /i've paid/i }),
      ).toBeInTheDocument(),
    );
  });

  it("renders a pay link for a link checkout", () => {
    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        checkout={{
          type: "link",
          transactionId: "tx1",
          url: "https://a.b",
          label: "PayLah",
        }}
        initialStatus="pending"
        amountCents={500}
      />,
    );
    expect(screen.getByRole("link", { name: /PayLah/ })).toHaveAttribute(
      "href",
      "https://a.b",
    );
  });

  it("shows a confirmed state once the vendor confirms", () => {
    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        checkout={{ type: "qr", transactionId: "tx1", payload: "x" }}
        initialStatus="confirmed"
        amountCents={800}
      />,
    );
    expect(screen.getByText(/payment confirmed/i)).toBeInTheDocument();
  });

  it("renders nothing when payment is not required", () => {
    const { container } = render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        checkout={null}
        initialStatus="not_required"
        amountCents={0}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a save button and instructions only for a QR checkout", () => {
    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        checkout={{ type: "qr", transactionId: "tx1", payload: "00020101" }}
        initialStatus="pending"
        amountCents={800}
      />,
    );
    expect(
      screen.getByRole("button", { name: /save qr image/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/scan it from your photos/i)).toBeInTheDocument();
  });

  it("hides the save button and instructions for a link checkout", () => {
    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        checkout={{
          type: "link",
          transactionId: "tx1",
          url: "https://a.b",
          label: "PayLah",
        }}
        initialStatus="pending"
        amountCents={500}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /save qr image/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/scan it from your photos/i),
    ).not.toBeInTheDocument();
  });

  it("shares the QR image via the Web Share API when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    Object.assign(navigator, { share, canShare });

    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        checkout={{ type: "qr", transactionId: "tx1", payload: "00020101" }}
        initialStatus="pending"
        amountCents={800}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save qr image/i }));
    await waitFor(() => expect(share).toHaveBeenCalled());
  });

  it("falls back to a download link when Web Share is unavailable", async () => {
    Object.assign(navigator, { share: undefined, canShare: undefined });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    URL.createObjectURL = vi.fn().mockReturnValue("blob:mock");
    URL.revokeObjectURL = vi.fn();

    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        checkout={{ type: "qr", transactionId: "tx1", payload: "00020101" }}
        initialStatus="pending"
        amountCents={800}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save qr image/i }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    clickSpy.mockRestore();
  });

  it("shows an error toast if the QR can't be rasterized", async () => {
    const { renderSvgToPngBlob } = await import("./qr-image");
    vi.mocked(renderSvgToPngBlob).mockRejectedValueOnce(
      new Error("Canvas is not supported"),
    );
    const { toast } = await import("sonner");

    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        checkout={{ type: "qr", transactionId: "tx1", payload: "00020101" }}
        initialStatus="pending"
        amountCents={800}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save qr image/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
