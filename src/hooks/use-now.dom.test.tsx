// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useNow } from "./use-now";

function Probe({ enabled = true }: { enabled?: boolean }) {
  const now = useNow(1_000, enabled);
  return <span>{now ?? "none"}</span>;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useNow", () => {
  it("renders null on the server so SSR output never depends on Date.now()", () => {
    const spy = vi.spyOn(Date, "now");
    expect(renderToString(<Probe />)).toBe("<span>none</span>");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("sets the clock on mount, then ticks every interval", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { result } = renderHook(() => useNow(1_000));
    expect(result.current).toBe(1_000_000);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(1_001_000);
  });

  it("sets the clock once but does not tick when disabled", () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
    const { result } = renderHook(() => useNow(1_000, false));
    expect(result.current).toBe(2_000_000);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toBe(2_000_000);
  });
});
