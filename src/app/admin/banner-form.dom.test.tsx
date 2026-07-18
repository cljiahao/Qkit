// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BannerForm } from "./banner-form";

const { setBannerMock } = vi.hoisted(() => ({ setBannerMock: vi.fn() }));
vi.mock("./actions", () => ({ setBanner: setBannerMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("BannerForm", () => {
  it("saves the toggle + message via setBanner", async () => {
    setBannerMock.mockResolvedValue({ success: true });
    render(
      <BannerForm initial={{ banner_enabled: false, banner_message: "" }} />,
    );

    fireEvent.click(screen.getByRole("switch"));
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: "Scheduled maintenance tonight" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(setBannerMock).toHaveBeenCalledWith({
        banner_enabled: true,
        banner_message: "Scheduled maintenance tonight",
      }),
    );
  });

  it("starts reflecting the initial enabled state", () => {
    render(
      <BannerForm
        initial={{ banner_enabled: true, banner_message: "Already live" }}
      />,
    );
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByDisplayValue("Already live")).toBeInTheDocument();
  });
});
