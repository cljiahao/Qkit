// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
vi.mock("../[orderNumber]/qr-image", () => ({
  renderSvgToPngBlob: vi
    .fn()
    .mockResolvedValue(new Blob(["x"], { type: "image/png" })),
}));

const QR_CHECKOUT = { type: "qr" as const, transactionId: "tx", payload: "p" };

// navigator.share/canShare don't exist in jsdom by default — tests that add
// them via Object.assign must remove them again so later tests see the same
// unset starting point regardless of execution order.
const hadShare = "share" in navigator;
const hadCanShare = "canShare" in navigator;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (!hadShare) delete (navigator as { share?: unknown }).share;
  if (!hadCanShare) delete (navigator as { canShare?: unknown }).canShare;
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

  // jsdom has no canvas, so resizeToWebp passes the original file through,
  // which is exactly the case this guards: a file the browser could not
  // shrink or re-encode. Uses image types, since the input's accept="image/*"
  // would stop user-event uploading anything else.
  it.each([
    [
      "an image type storage rejects",
      new File(["heic"], "IMG_0001.HEIC", { type: "image/heic" }),
      /JPEG, PNG or WebP/,
    ],
    [
      "a file over 1 MB",
      new File([new Uint8Array(1024 * 1024 + 1)], "big.png", {
        type: "image/png",
      }),
      /too large/,
    ],
  ])(
    "rejects %s on selection, without calling claimPayment",
    async (_label, file, message) => {
      const user = userEvent.setup();
      render(
        <PayForm
          boothId="b1"
          token="t1"
          amountCents={550}
          checkout={QR_CHECKOUT}
        />,
      );
      await user.upload(screen.getByLabelText(/upload/i), file);
      expect(await screen.findByText(message)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /i've paid/i }));
      expect(claimPaymentMock).not.toHaveBeenCalled();
    },
  );

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

  it("shows a save button and instructions only for a QR checkout", () => {
    render(
      <PayForm
        boothId="b1"
        token="t1"
        amountCents={800}
        checkout={QR_CHECKOUT}
      />,
    );
    expect(
      screen.getByRole("button", { name: /save qr image/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/scan it from your photos/i)).toBeInTheDocument();
  });

  it("hides the save button and instructions for a link checkout", () => {
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
      <PayForm
        boothId="b1"
        token="t1"
        amountCents={800}
        checkout={QR_CHECKOUT}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /save qr image/i }));
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
      <PayForm
        boothId="b1"
        token="t1"
        amountCents={800}
        checkout={QR_CHECKOUT}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /save qr image/i }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    clickSpy.mockRestore();
  });

  it("shows an error toast if the QR can't be rasterized", async () => {
    const { renderSvgToPngBlob } = await import("../[orderNumber]/qr-image");
    vi.mocked(renderSvgToPngBlob).mockRejectedValueOnce(
      new Error("Canvas is not supported"),
    );
    const { toast } = await import("sonner");

    render(
      <PayForm
        boothId="b1"
        token="t1"
        amountCents={800}
        checkout={QR_CHECKOUT}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /save qr image/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
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
