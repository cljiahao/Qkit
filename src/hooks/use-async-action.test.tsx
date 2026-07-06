// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAsyncAction } from "./use-async-action";

describe("useAsyncAction", () => {
  it("starts idle and resets pending after the handler resolves", async () => {
    const { result } = renderHook(() => useAsyncAction());
    expect(result.current.pending).toBe(false);
    await act(async () => {
      await result.current.run(async () => {});
    });
    expect(result.current.pending).toBe(false);
  });

  it("resets pending to false even when the handler throws", async () => {
    // The whole reason this hook exists: a rejecting handler must still clear
    // the pending flag (the hand-rolled versions left the button stuck-disabled).
    const { result } = renderHook(() => useAsyncAction());
    await act(async () => {
      await expect(
        result.current.run(async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
    });
    expect(result.current.pending).toBe(false);
  });

  it("is pending while the handler is in flight", async () => {
    const { result } = renderHook(() => useAsyncAction());
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let running!: Promise<void>;
    act(() => {
      running = result.current.run(() => gate);
    });
    expect(result.current.pending).toBe(true);
    await act(async () => {
      release();
      await running;
    });
    expect(result.current.pending).toBe(false);
  });
});
