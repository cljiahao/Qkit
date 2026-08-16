// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const disconnectTelegram = vi.fn();
vi.mock("./telegram-actions", () => ({
  disconnectTelegram: (...args: unknown[]) => disconnectTelegram(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TelegramSection } from "./telegram-section";

beforeEach(() => {
  disconnectTelegram.mockReset();
});

describe("TelegramSection", () => {
  it("renders the deep-link QR + a tappable link when disconnected", () => {
    render(
      <TelegramSection
        connected={false}
        deepLinkUrl="https://t.me/QkitOrdersBot?start=abc123"
      />,
    );
    expect(
      screen.getByRole("link", { name: /t\.me\/QkitOrdersBot/i }),
    ).toHaveAttribute("href", "https://t.me/QkitOrdersBot?start=abc123");
    // react-qr-code renders inside this wrapper.
    expect(screen.getByTestId("telegram-qr")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /disconnect/i }),
    ).not.toBeInTheDocument();
  });

  it("renders a Connected state + disconnect action when already linked", () => {
    render(<TelegramSection connected={true} deepLinkUrl={null} />);
    expect(screen.getByText(/connected/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /disconnect/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("telegram-qr")).not.toBeInTheDocument();
  });

  it("disconnect calls disconnectTelegram", async () => {
    disconnectTelegram.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<TelegramSection connected={true} deepLinkUrl={null} />);

    await user.click(screen.getByRole("button", { name: /disconnect/i }));

    expect(disconnectTelegram).toHaveBeenCalledTimes(1);
  });
});
