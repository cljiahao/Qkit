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
import type { BoardSettings } from "@/lib/types";

const DEFAULTS: BoardSettings = {
  aging_min: 5,
  overdue_min: 10,
  sound_id: "chime",
  desktop_notify: false,
  undo_seconds: 4,
  daily_order_number_reset: false,
  show_wait_estimate: true,
  default_prep_minutes: null,
  ready_auto_clear_min: 3,
};

const PREP_ESTIMATE = { avgMinutes: null, sampleCount: 0, minSample: 10 };

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
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

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
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

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
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    const undoSeconds = screen.getByLabelText(/undo window/i);
    await user.clear(undoSeconds);
    await user.type(undoSeconds, "8");
    await user.click(screen.getByRole("button", { name: /save timing/i }));

    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ undo_seconds: 8 }),
    );
  });

  it("rejects an undo window outside 2-15s without calling the action", async () => {
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    const undoSeconds = screen.getByLabelText(/undo window/i);
    await user.clear(undoSeconds);
    await user.type(undoSeconds, "30");
    await user.click(screen.getByRole("button", { name: /save timing/i }));

    expect(updateBoardSettings).not.toHaveBeenCalled();
  });

  it("saves a changed ready-auto-clear minutes value", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);
    const user = userEvent.setup();
    const input = screen.getByLabelText(/auto-clear after/i);
    await user.clear(input);
    await user.type(input, "5");
    await user.click(screen.getByRole("button", { name: /save timing/i }));
    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ ready_auto_clear_min: 5 }),
    );
  });
});

describe("SettingsForm sound", () => {
  it("selecting a preset previews it and saves immediately", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

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
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

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
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    await user.click(
      screen.getByRole("switch", { name: /desktop notifications/i }),
    );
    expect(updateBoardSettings).not.toHaveBeenCalled();
    expect(
      screen.getByRole("switch", { name: /desktop notifications/i }),
    ).not.toBeChecked();
  });

  it("offers an in-browser enable button when already on but not granted, without touching the account setting", async () => {
    notifyPermission.mockReturnValue("default");
    requestNotifyPermission.mockResolvedValueOnce("granted");
    const user = userEvent.setup();
    render(
      <SettingsForm
        initial={{ ...DEFAULTS, desktop_notify: true }}
        prepEstimate={PREP_ESTIMATE}
      />,
    );

    expect(
      screen.getByText(/not allowed in this browser yet/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /enable in this browser/i }),
    );

    expect(requestNotifyPermission).toHaveBeenCalled();
    expect(updateBoardSettings).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/not allowed in this browser yet/i),
    ).not.toBeInTheDocument();
  });
});

describe("SettingsForm customer order screen", () => {
  it("saves the daily order-number reset toggle", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    await user.click(
      screen.getByRole("switch", {
        name: /show a simple daily order number instead of the permanent one/i,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: /save customer screen/i }),
    );

    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ daily_order_number_reset: true }),
    );
  });

  it("saves the show-wait-estimate toggle and disables the backup-prep input while it's off", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    const toggle = screen.getByRole("switch", {
      name: /show a wait-time estimate to customers/i,
    });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(screen.getByLabelText(/backup prep time/i)).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: /save customer screen/i }),
    );

    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ show_wait_estimate: false }),
    );
  });

  it("saves a configured backup prep time", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    const prepMin = screen.getByLabelText(/backup prep time/i);
    await user.type(prepMin, "8");
    await user.click(
      screen.getByRole("button", { name: /save customer screen/i }),
    );

    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ default_prep_minutes: 8 }),
    );
  });

  it("saves null when the backup prep time is cleared", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(
      <SettingsForm
        initial={{ ...DEFAULTS, default_prep_minutes: 8 }}
        prepEstimate={PREP_ESTIMATE}
      />,
    );

    const prepMin = screen.getByLabelText(/backup prep time/i);
    await user.clear(prepMin);
    await user.click(
      screen.getByRole("button", { name: /save customer screen/i }),
    );

    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ default_prep_minutes: null }),
    );
  });

  it("rejects a backup prep time outside 1-60min without calling the action", async () => {
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    const prepMin = screen.getByLabelText(/backup prep time/i);
    await user.type(prepMin, "90");
    await user.click(
      screen.getByRole("button", { name: /save customer screen/i }),
    );

    expect(updateBoardSettings).not.toHaveBeenCalled();
  });

  it("shows a not-enough-history disclaimer naming the queue-position fallback when no backup is set", () => {
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    expect(
      screen.getByText(/not enough recent order history yet/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/their queue position/i)).toBeInTheDocument();
  });

  it("names the backup number in the disclaimer once one is set", () => {
    render(
      <SettingsForm
        initial={{ ...DEFAULTS, default_prep_minutes: 8 }}
        prepEstimate={PREP_ESTIMATE}
      />,
    );

    expect(screen.getByText(/this backup number/i)).toBeInTheDocument();
  });

  it("shows the live estimate instead of the disclaimer once enough history exists", () => {
    render(
      <SettingsForm
        initial={DEFAULTS}
        prepEstimate={{ avgMinutes: 4, sampleCount: 20, minSample: 10 }}
      />,
    );

    expect(screen.getByText(/live right now/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/not enough recent order history yet/i),
    ).not.toBeInTheDocument();
  });
});
