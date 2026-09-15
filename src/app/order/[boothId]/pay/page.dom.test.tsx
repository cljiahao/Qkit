// @vitest-environment jsdom
//
// PayForm has its own dedicated test file, so it's stubbed here to keep this
// test focused on page.tsx's own validation/notFound gating — same pattern
// as ../pickup/page.dom.test.tsx.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PayPage from "./page";

const { notFoundMock, loadPreClaimContextMock } = vi.hoisted(() => ({
  // Real notFound() throws to abort rendering — mirror that so a test
  // hitting the notFound branch doesn't fall through into the rest of the
  // function body, same as it never would in production.
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  loadPreClaimContextMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("../[orderNumber]/payment-actions", () => ({
  loadPreClaimContext: loadPreClaimContextMock,
}));
vi.mock("./pay-form", () => ({
  PayForm: ({
    boothId,
    token,
    amountCents,
    checkout,
  }: {
    boothId: string;
    token: string;
    amountCents: number;
    checkout: unknown;
  }) => (
    <div
      data-testid="pay-form"
      data-booth-id={boothId}
      data-token={token}
      data-amount-cents={amountCents}
      data-checkout={JSON.stringify(checkout)}
    />
  ),
}));

const BOOTH_ID = "00000000-0000-4000-8000-000000000001";
const TOKEN = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  notFoundMock.mockReset().mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
  loadPreClaimContextMock.mockReset();
});

describe("PayPage", () => {
  it("calls notFound for an invalid booth id", async () => {
    await expect(
      PayPage({
        params: Promise.resolve({ boothId: "not-a-uuid" }),
        searchParams: Promise.resolve({ t: TOKEN }),
      }),
    ).rejects.toThrow();
    expect(notFoundMock).toHaveBeenCalled();
    expect(loadPreClaimContextMock).not.toHaveBeenCalled();
  });

  it("calls notFound when the token is missing", async () => {
    await expect(
      PayPage({
        params: Promise.resolve({ boothId: BOOTH_ID }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow();
    expect(notFoundMock).toHaveBeenCalled();
    expect(loadPreClaimContextMock).not.toHaveBeenCalled();
  });

  it("calls notFound when loadPreClaimContext returns null (bad token / already claimed / wrong status)", async () => {
    loadPreClaimContextMock.mockResolvedValue(null);
    await expect(
      PayPage({
        params: Promise.resolve({ boothId: BOOTH_ID }),
        searchParams: Promise.resolve({ t: TOKEN }),
      }),
    ).rejects.toThrow();
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("renders PayForm with the order id, amount, and checkout when valid", async () => {
    loadPreClaimContextMock.mockResolvedValue({
      orderId: "order-1",
      amountCents: 550,
      checkout: { type: "qr", transactionId: "tx-1", payload: "p" },
    });

    render(
      await PayPage({
        params: Promise.resolve({ boothId: BOOTH_ID }),
        searchParams: Promise.resolve({ t: TOKEN }),
      }),
    );

    const form = screen.getByTestId("pay-form");
    expect(form).toHaveAttribute("data-booth-id", BOOTH_ID);
    expect(form).toHaveAttribute("data-token", TOKEN);
    expect(form).toHaveAttribute("data-amount-cents", "550");
    expect(form).toHaveAttribute(
      "data-checkout",
      JSON.stringify({ type: "qr", transactionId: "tx-1", payload: "p" }),
    );
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
