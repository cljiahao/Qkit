// @vitest-environment jsdom
import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrinterStatus } from "./printer-status";

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

describe("PrinterStatus", () => {
  it("subscribes to printkit's own presence channel, keyed by vendorId and locationId", () => {
    render(<PrinterStatus vendorId="v1" locationId="loc-42" />);
    expect(channelSpy).toHaveBeenCalledWith("printkit:presence:v1:loc-42");
  });

  it("shows offline until a presence sync reports a bridge", () => {
    render(<PrinterStatus vendorId="v1" locationId="loc-42" />);
    expect(screen.getByText("No printer connected")).toBeInTheDocument();
  });

  it("shows online once presence sync reports a tracked bridge", () => {
    render(<PrinterStatus vendorId="v1" locationId="loc-42" />);
    presenceState = { bridge: [{ online: true }] };
    act(() => syncCallback?.());
    expect(screen.getByText("Printer connected")).toBeInTheDocument();
  });

  it("reverts to offline if the bridge later disappears from presence", () => {
    render(<PrinterStatus vendorId="v1" locationId="loc-42" />);
    presenceState = { bridge: [{ online: true }] };
    act(() => syncCallback?.());
    presenceState = {};
    act(() => syncCallback?.());
    expect(screen.getByText("No printer connected")).toBeInTheDocument();
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = render(
      <PrinterStatus vendorId="v1" locationId="loc-42" />,
    );
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
