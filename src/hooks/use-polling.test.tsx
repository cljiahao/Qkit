// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePolling } from "./use-polling";

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    value: hidden,
    configurable: true,
  });
}

describe("usePolling", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
  });

  it("does nothing while disabled", () => {
    setHidden(false);
    const tick = vi.fn();
    renderHook(() => usePolling(tick, { intervalMs: 1000, enabled: false }));
    vi.advanceTimersByTime(3000);
    expect(tick).not.toHaveBeenCalled();
  });

  it("fires an immediate tick on mount, then every interval, while visible", () => {
    setHidden(false);
    const tick = vi.fn();
    renderHook(() => usePolling(tick, { intervalMs: 1000, enabled: true }));
    expect(tick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    expect(tick).toHaveBeenCalledTimes(4);
  });

  it("stays quiet while the tab is hidden", () => {
    setHidden(true);
    const tick = vi.fn();
    renderHook(() => usePolling(tick, { intervalMs: 1000, enabled: true }));
    vi.advanceTimersByTime(3000);
    expect(tick).not.toHaveBeenCalled();
  });

  it("fires an immediate tick when the tab becomes visible again", () => {
    setHidden(true);
    const tick = vi.fn();
    renderHook(() => usePolling(tick, { intervalMs: 1000, enabled: true }));
    expect(tick).not.toHaveBeenCalled();
    setHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("stops ticking on unmount", () => {
    setHidden(false);
    const tick = vi.fn();
    const { unmount } = renderHook(() =>
      usePolling(tick, { intervalMs: 1000, enabled: true }),
    );
    expect(tick).toHaveBeenCalledTimes(1);
    unmount();
    vi.advanceTimersByTime(5000);
    expect(tick).toHaveBeenCalledTimes(1);
  });
});
