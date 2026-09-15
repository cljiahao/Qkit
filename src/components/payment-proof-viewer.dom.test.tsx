// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaymentProofViewer } from "./payment-proof-viewer";

// getProofPhotoUrl/findDuplicateProofOrder are server actions (proof-actions.ts,
// covered by its own tests) — mocked here so this component's tests only
// assert on rendering, not on the underlying Supabase queries.
const { getProofPhotoUrlMock, findDuplicateProofOrderMock } = vi.hoisted(
  () => ({
    getProofPhotoUrlMock: vi.fn(),
    findDuplicateProofOrderMock: vi.fn(),
  }),
);

vi.mock("@/app/dashboard/proof-actions", () => ({
  getProofPhotoUrl: getProofPhotoUrlMock,
  findDuplicateProofOrder: findDuplicateProofOrderMock,
}));

// tesseract.js is a heavy WASM library, loaded via a dynamic import inside the
// component (never at module scope) — mocked entirely so this test never
// actually loads WASM, matching this codebase's next/dynamic-for-heavy-deps
// pattern (see PayPanel/react-qr-code).
const { createWorkerMock, recognizeMock, terminateMock } = vi.hoisted(() => ({
  createWorkerMock: vi.fn(),
  recognizeMock: vi.fn(),
  terminateMock: vi.fn(),
}));

vi.mock("tesseract.js", () => ({
  createWorker: createWorkerMock,
}));

beforeEach(() => {
  getProofPhotoUrlMock.mockReset();
  findDuplicateProofOrderMock.mockReset();
  createWorkerMock.mockReset();
  recognizeMock.mockReset();
  terminateMock.mockReset();
  terminateMock.mockResolvedValue(undefined);
  createWorkerMock.mockResolvedValue({
    recognize: recognizeMock,
    terminate: terminateMock,
  });
  recognizeMock.mockResolvedValue({ data: { text: "" } });
});

describe("PaymentProofViewer", () => {
  it("shows a loading state, then the photo, then the OCR + duplicate hints", async () => {
    getProofPhotoUrlMock.mockResolvedValueOnce(
      "https://signed.example/proof.png",
    );
    findDuplicateProofOrderMock.mockResolvedValueOnce(null);
    recognizeMock.mockResolvedValueOnce({ data: { text: "PAID $5.50" } });

    render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);

    expect(await screen.findByRole("img")).toBeInTheDocument();
    expect(
      await screen.findByText(/looks like \$5\.50, paid/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/already used for order/i),
    ).not.toBeInTheDocument();
  });

  it("shows the duplicate warning when another order shares the same photo hash", async () => {
    getProofPhotoUrlMock.mockResolvedValueOnce(
      "https://signed.example/proof.png",
    );
    findDuplicateProofOrderMock.mockResolvedValueOnce("0031");

    render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);

    expect(
      await screen.findByText(/already used for order #0031/i),
    ).toBeInTheDocument();
  });

  it("renders nothing while loading and nothing at all when there is no photo", async () => {
    getProofPhotoUrlMock.mockResolvedValueOnce(null);
    findDuplicateProofOrderMock.mockResolvedValueOnce(null);

    const { container } = render(
      <PaymentProofViewer orderId="order-2" expectedAmountCents={550} />,
    );

    expect(container).toBeEmptyDOMElement();
    await vi.waitFor(() => {
      expect(getProofPhotoUrlMock).toHaveBeenCalledWith("order-2");
    });
    expect(container).toBeEmptyDOMElement();
    expect(createWorkerMock).not.toHaveBeenCalled();
  });

  it("spawns the tesseract worker with workerBlobURL disabled (blob: workers are refused under this app's CSP, which has no worker-src/child-src)", async () => {
    getProofPhotoUrlMock.mockResolvedValueOnce(
      "https://signed.example/proof.png",
    );
    findDuplicateProofOrderMock.mockResolvedValueOnce(null);

    render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);

    await vi.waitFor(() => expect(createWorkerMock).toHaveBeenCalled());
    expect(createWorkerMock).toHaveBeenCalledWith(
      "eng",
      1,
      expect.objectContaining({ workerBlobURL: false }),
    );
  });

  it("shows a couldn't-confirm hint when the OCR text doesn't contain the amount", async () => {
    getProofPhotoUrlMock.mockResolvedValueOnce(
      "https://signed.example/proof.png",
    );
    findDuplicateProofOrderMock.mockResolvedValueOnce(null);
    recognizeMock.mockResolvedValueOnce({ data: { text: "no numbers here" } });

    render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);

    expect(await screen.findByRole("img")).toBeInTheDocument();
    expect(
      await screen.findByText(/couldn't confirm the amount/i),
    ).toBeInTheDocument();
  });
});
