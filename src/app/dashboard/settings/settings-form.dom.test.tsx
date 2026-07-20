// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateBoardSettings = vi.fn();
vi.mock("./actions", () => ({
  updateBoardSettings: (...args: unknown[]) => updateBoardSettings(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const playSound = vi.fn(async (_soundId?: string) => true);
const unlockAudio = vi.fn();
const requestNotifyPermission = vi.fn(async () => "granted");
const isNotifySupported = vi.fn(() => true);
const notifyPermission = vi.fn(() => "granted");
vi.mock("@/lib/order-alerts", () => ({
  playSound: (id?: string) => playSound(id),
  unlockAudio: () => unlockAudio(),
  requestNotifyPermission: () => requestNotifyPermission(),
  isNotifySupported: () => isNotifySupported(),
  notifyPermission: () => notifyPermission(),
}));

import { SettingsForm } from "./settings-form";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { BoardSettings } from "@/lib/types";

const DEFAULTS: BoardSettings = {
  aging_min: 5,
  overdue_min: 10,
  sound_id: "chime",
  desktop_notify: false,
  undo_seconds: 4,
  daily_order_number_reset: false,
  default_prep_minutes: null,
};

beforeEach(() => {
  updateBoardSettings.mockReset();
  playSound.mockClear();
  unlockAudio.mockClear();
  requestNotifyPermission.mockClear();
  notifyPermission.mockReturnValue("granted");
});

describe("SettingsForm thresholds", () => {
  it("rejects overdue <= aging without calling the action", async () => {
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} />, { wrapper: TooltipProvider });

    const overdue = screen.getByLabelText(/turn red after/i);
    await user.clear(overdue);
    await user.type(overdue, "3");
    await user.click(screen.getByRole("button", { name: /save timing/i }));

    expect(
      screen.getByText(/overdue must be later than amber/i),
    ).toBeInTheDocument();
    expect(updateBoardSettings).not.toHaveBeenCalled();
  });

  it("saves valid thresholds", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} />, { wrapper: TooltipProvider });

    const aging = screen.getByLabelText(/turn amber after/i);
    await user.clear(aging);
    await user.type(aging, "3");
    await user.click(screen.getByRole("button", { name: /save timing/i }));

    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ aging_min: 3, overdue_min: 10 }),
    );
  });

  it("saves a changed undo window", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} />, { wrapper: TooltipProvider });

    const undoSeconds = screen.getByLabelText(/advance undo window/i);
    await user.clear(undoSeconds);
    await user.type(undoSeconds, "8");
    await user.click(screen.getByRole("button", { name: /save timing/i }));

    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ undo_seconds: 8 }),
    );
  });

  it("rejects an undo window outside 2-15s without calling the action", async () => {
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} />, { wrapper: TooltipProvider });

    const undoSeconds = screen.getByLabelText(/advance undo window/i);
    await user.clear(undoSeconds);
    await user.type(undoSeconds, "30");
    await user.click(screen.getByRole("button", { name: /save timing/i }));

    expect(updateBoardSettings).not.toHaveBeenCalled();
  });
});

describe("SettingsForm sound", () => {
  it("selecting a preset previews it and saves immediately", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} />, { wrapper: TooltipProvider });

    await user.click(screen.getByRole("radio", { name: "Bell" }));
    expect(playSound).toHaveBeenCalledWith("bell");
    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ sound_id: "bell" }),
    );
  });
});

describe("SettingsForm desktop notifications", () => {
  it("turning on requests permission then saves", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} />, { wrapper: TooltipProvider });

    await user.click(
      screen.getByRole("switch", { name: /desktop notifications/i }),
    );
    expect(requestNotifyPermission).toHaveBeenCalled();
    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ desktop_notify: true }),
    );
  });

  it("reverts and shows an error when permission is denied", async () => {
    requestNotifyPermission.mockResolvedValueOnce("denied");
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} />, { wrapper: TooltipProvider });

    await user.click(
      screen.getByRole("switch", { name: /desktop notifications/i }),
    );
    expect(updateBoardSettings).not.toHaveBeenCalled();
    expect(
      screen.getByRole("switch", { name: /desktop notifications/i }),
    ).not.toBeChecked();
  });
});

describe("SettingsForm order display", () => {
  it("saves the daily order-number reset toggle", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} />, { wrapper: TooltipProvider });

    await user.click(
      screen.getByRole("switch", {
        name: /show today's order number instead of the permanent one/i,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: /save order display/i }),
    );

    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ daily_order_number_reset: true }),
    );
  });

  it("saves a configured fallback wait estimate", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} />, { wrapper: TooltipProvider });

    const prepMin = screen.getByLabelText(/fallback wait estimate/i);
    await user.type(prepMin, "8");
    await user.click(
      screen.getByRole("button", { name: /save order display/i }),
    );

    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ default_prep_minutes: 8 }),
    );
  });

  it("saves null when the fallback wait estimate is cleared", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(
      <SettingsForm initial={{ ...DEFAULTS, default_prep_minutes: 8 }} />,
      { wrapper: TooltipProvider },
    );

    const prepMin = screen.getByLabelText(/fallback wait estimate/i);
    await user.clear(prepMin);
    await user.click(
      screen.getByRole("button", { name: /save order display/i }),
    );

    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ default_prep_minutes: null }),
    );
  });

  it("rejects a fallback wait estimate outside 1-60min without calling the action", async () => {
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} />, { wrapper: TooltipProvider });

    const prepMin = screen.getByLabelText(/fallback wait estimate/i);
    await user.type(prepMin, "90");
    await user.click(
      screen.getByRole("button", { name: /save order display/i }),
    );

    expect(updateBoardSettings).not.toHaveBeenCalled();
  });
});
