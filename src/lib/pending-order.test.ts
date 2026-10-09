// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  clearPendingOrder,
  loadPendingOrder,
  orderFingerprint,
  savePendingOrder,
} from "./pending-order";

beforeEach(() => {
  window.sessionStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("pending order recovery", () => {
  const input = {
    customerName: "Ada",
    customerPhone: "+6598765432",
    items: [{ menuItemId: "coffee", name: "Coffee", quantity: 1 }],
  };
  it("stores only replay metadata and isolates booth sessions", async () => {
    const pending = {
      key: "00000000-0000-4000-8000-000000000001",
      fingerprint: await orderFingerprint(input),
    };
    savePendingOrder("a", pending);
    expect(loadPendingOrder("a")).toEqual(pending);
    expect(loadPendingOrder("b")).toBeNull();
    expect(window.sessionStorage.getItem("qkit:pending-order:a")).not.toContain(
      input.customerName,
    );
    expect(window.sessionStorage.getItem("qkit:pending-order:a")).not.toContain(
      input.customerPhone,
    );
    clearPendingOrder("a");
    expect(loadPendingOrder("a")).toBeNull();
  });
  it("normalizes item order and display metadata but distinguishes quantities and identity", async () => {
    const tea = { menuItemId: "tea", name: "Tea", quantity: 2 };
    const first = { ...input, items: [...input.items, tea] };
    expect(await orderFingerprint(first)).toBe(
      await orderFingerprint({
        ...input,
        items: [tea, { ...input.items[0], name: "Renamed", price_cents: 999 }],
      }),
    );
    expect(await orderFingerprint(first)).not.toBe(
      await orderFingerprint({ ...first, customerName: "Grace" }),
    );
    expect(await orderFingerprint(first)).not.toBe(
      await orderFingerprint({
        ...input,
        items: [{ ...tea, quantity: 3 }, ...input.items],
      }),
    );
  });
  it.each(["not-json", "{}", '{"key":"invalid","fingerprint":"abc"}'])(
    "rejects corrupt recovery metadata %s",
    (raw) => {
      window.sessionStorage.setItem("qkit:pending-order:a", raw);
      expect(() => loadPendingOrder("a")).toThrow();
    },
  );
  it("does not hide blocked storage writes", async () => {
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementationOnce(() => {
        throw new DOMException("Quota", "QuotaExceededError");
      });
    expect(() =>
      savePendingOrder("a", {
        key: "00000000-0000-4000-8000-000000000001",
        fingerprint: "a".repeat(64),
      }),
    ).toThrow();
    write.mockRestore();
  });
});
