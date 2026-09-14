// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePrinterPresence } from "./use-printer-presence";

let syncCallback: (() => void) | undefined;
let presenceState: Record<string, unknown[]>;
const unsubscribe = vi.fn();
const channelSpy = vi.fn();

function makeChannel() {
  const channel = {
    on: vi.fn((_event: string, _filter: unknown, cb: () => void) => {
      syncCallback = cb;
      return channel;
    }),
    subscribe: vi.fn(() => channel),
    unsubscribe,
    presenceState: () => presenceState,
  };
  return channel;
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: (name: string) => {
      channelSpy(name);
      return makeChannel();
    },
  }),
}));

beforeEach(() => {
  syncCallback = undefined;
  presenceState = {};
  unsubscribe.mockReset();
  channelSpy.mockReset();
});

describe("usePrinterPresence", () => {
  it("returns false without subscribing when locationId is unset", () => {
    const { result } = renderHook(() => usePrinterPresence("v1", null));
    expect(result.current).toBe(false);
    expect(channelSpy).not.toHaveBeenCalled();
  });

  it("subscribes to printkit's presence channel keyed by vendorId and locationId", () => {
    renderHook(() => usePrinterPresence("v1", "loc-42"));
    expect(channelSpy).toHaveBeenCalledWith("printkit:presence:v1:loc-42");
  });

  it("flips to true once presence sync reports a tracked bridge", () => {
    const { result } = renderHook(() => usePrinterPresence("v1", "loc-42"));
    presenceState = { bridge: [{ online: true }] };
    act(() => syncCallback?.());
    expect(result.current).toBe(true);
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => usePrinterPresence("v1", "loc-42"));
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
