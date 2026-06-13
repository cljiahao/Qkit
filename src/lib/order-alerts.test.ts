import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireReadyNotification,
  isNotifySupported,
  notifyPermission,
  playReadyChime,
  requestNotifyPermission,
} from "./order-alerts";

// Minimal Notification stub. The constructor records its args so we can assert
// a popup was fired; static permission/requestPermission are configurable.
function installNotification(
  permission: NotificationPermission,
  opts: { requestResult?: NotificationPermission; throwOnNew?: boolean } = {},
) {
  const ctor = vi.fn((title: string, init?: NotificationOptions) => {
    if (opts.throwOnNew) throw new Error("no service worker");
    return { title, ...init };
  }) as unknown as typeof Notification;
  Object.assign(ctor, {
    permission,
    requestPermission: vi.fn(async () => opts.requestResult ?? permission),
  });
  vi.stubGlobal("Notification", ctor);
  vi.stubGlobal("window", { Notification: ctor });
  return ctor;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notification support + permission", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports unsupported when Notification is absent", () => {
    vi.stubGlobal("window", {});
    expect(isNotifySupported()).toBe(false);
    expect(notifyPermission()).toBeNull();
  });

  it("reports support + current permission when present", () => {
    installNotification("default");
    expect(isNotifySupported()).toBe(true);
    expect(notifyPermission()).toBe("default");
  });

  it("requestNotifyPermission returns null when unsupported", async () => {
    vi.stubGlobal("window", {});
    expect(await requestNotifyPermission()).toBeNull();
  });

  it("requestNotifyPermission proxies the browser result", async () => {
    installNotification("default", { requestResult: "granted" });
    expect(await requestNotifyPermission()).toBe("granted");
  });

  it("requestNotifyPermission swallows a thrown permission call", async () => {
    const ctor = installNotification("default");
    (ctor.requestPermission as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("blocked"),
    );
    expect(await requestNotifyPermission()).toBeNull();
  });
});

describe("fireReadyNotification", () => {
  it("does nothing when permission is not granted", () => {
    const ctor = installNotification("default");
    fireReadyNotification("Booth", "0001");
    expect(ctor).not.toHaveBeenCalled();
  });

  it("constructs a notification when granted", () => {
    const ctor = installNotification("granted");
    fireReadyNotification("Mama's Kitchen", "0042");
    expect(ctor).toHaveBeenCalledWith(
      "Order #0042 is ready",
      expect.objectContaining({ tag: "qkit-order-0042" }),
    );
  });

  it("swallows constructor errors", () => {
    installNotification("granted", { throwOnNew: true });
    expect(() => fireReadyNotification("Booth", "0001")).not.toThrow();
  });

  it("is a no-op when unsupported", () => {
    vi.stubGlobal("window", {});
    expect(() => fireReadyNotification("Booth", "0001")).not.toThrow();
  });
});

describe("playReadyChime", () => {
  it("returns false when no AudioContext exists", () => {
    vi.stubGlobal("window", {});
    expect(playReadyChime()).toBe(false);
  });

  it("schedules oscillators via AudioContext and returns true", () => {
    const osc = {
      type: "",
      frequency: { value: 0 },
      connect: vi.fn(() => gain),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    const ctx = {
      currentTime: 0,
      destination: {},
      resume: vi.fn(),
      createOscillator: vi.fn(() => osc),
      createGain: vi.fn(() => gain),
    };
    const Ctor = vi.fn(() => ctx);
    vi.stubGlobal("window", { AudioContext: Ctor });

    expect(playReadyChime()).toBe(true);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
    expect(osc.start).toHaveBeenCalledTimes(2);
  });

  it("returns false if the AudioContext throws", () => {
    const Ctor = vi.fn(() => {
      throw new Error("audio blocked");
    });
    vi.stubGlobal("window", { AudioContext: Ctor });
    expect(playReadyChime()).toBe(false);
  });
});
