// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TelegramConnect } from "./telegram-connect";

const { mintCustomerConnectTokenMock } = vi.hoisted(() => ({
  mintCustomerConnectTokenMock: vi.fn(),
}));
vi.mock("@/lib/merqo-customer-notify", () => ({
  mintCustomerConnectToken: mintCustomerConnectTokenMock,
}));

afterEach(() => vi.restoreAllMocks());

describe("TelegramConnect", () => {
  it("renders the link + one-line disclosure on a successful token mint", async () => {
    mintCustomerConnectTokenMock.mockResolvedValue({
      token: "tok123",
      deep_link: "https://t.me/merqobot?start=tok123",
    });

    render(await TelegramConnect({ orderId: "o1", vendorId: "v1" }));

    expect(mintCustomerConnectTokenMock).toHaveBeenCalledWith(
      "v1",
      "qkit",
      "qkit:o1",
    );
    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", "https://t.me/merqobot?start=tok123");
    expect(link).toHaveTextContent(/get notified on telegram/i);
    expect(
      screen.getByText(/connects you to merqo on telegram/i),
    ).toBeInTheDocument();
  });

  it("renders nothing when mintCustomerConnectToken returns null", async () => {
    mintCustomerConnectTokenMock.mockResolvedValue(null);

    render(await TelegramConnect({ orderId: "o1", vendorId: "v1" }));

    await waitFor(() =>
      expect(screen.queryByRole("link")).not.toBeInTheDocument(),
    );
  });
});
