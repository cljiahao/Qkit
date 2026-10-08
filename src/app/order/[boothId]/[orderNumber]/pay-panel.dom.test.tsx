// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PayPanel } from "./pay-panel";
import { getPaymentStatus } from "./payment-actions";

const { replace, refresh } = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

vi.mock("./payment-actions", () => ({
  unclaimPayment: vi.fn().mockResolvedValue({ success: true }),
  // Poll returns the same status so the effect is a no-op in tests.
  getPaymentStatus: vi.fn().mockResolvedValue("claimed"),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("PayPanel", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows a waiting-for-confirmation state while claimed", () => {
    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        initialStatus="claimed"
      />,
    );
    expect(screen.getByText(/payment sent/i)).toBeInTheDocument();
  });

  it("lets the customer undo an accidental claim", async () => {
    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        initialStatus="claimed"
      />,
    );
    expect(screen.getByText(/payment sent/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    await waitFor(() =>
      expect(screen.queryByText(/payment sent/i)).not.toBeInTheDocument(),
    );
    expect(replace).toHaveBeenCalledWith("/order/b/pay?t=tok");
  });

  it("refreshes server-rendered payment instructions when confirmation arrives", async () => {
    vi.mocked(getPaymentStatus).mockResolvedValueOnce("confirmed");
    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        initialStatus="claimed"
      />,
    );
    await screen.findByText(/payment confirmed/i);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows a confirmed state once the vendor confirms", () => {
    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        initialStatus="confirmed"
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
        initialStatus="not_required"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
