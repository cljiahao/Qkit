import { installBrowserStorage } from "../../test/browser-storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveCart, loadCart, clearCart, holdSessionId } from "./cart-storage";
import type { ReorderLine } from "./reorder";

const LINES: ReorderLine[] = [
  {
    menuItemId: "latte",
    quantity: 2,
    options: [{ group: "Milk", choice: "Oat" }],
  },
  { menuItemId: "kopi", quantity: 1 },
];

beforeEach(() => {
  vi.unstubAllGlobals();
  installBrowserStorage("sessionStorage");
});

describe("cart-storage", () => {
  it("round-trips a cart per booth", () => {
    saveCart("b1", LINES);
    expect(loadCart("b1")).toEqual(LINES);
  });

  it("isolates carts by booth", () => {
    saveCart("b1", LINES);
    expect(loadCart("b2")).toEqual([]);
  });

  it("returns empty when nothing stored", () => {
    expect(loadCart("b1")).toEqual([]);
  });

  it("saving an empty cart clears the key (not '[]')", () => {
    saveCart("b1", LINES);
    saveCart("b1", []);
    expect(sessionStorage.getItem("qkit:cart:b1")).toBeNull();
    expect(loadCart("b1")).toEqual([]);
  });

  it("clearCart removes a stored cart", () => {
    saveCart("b1", LINES);
    clearCart("b1");
    expect(loadCart("b1")).toEqual([]);
  });

  it("drops malformed lines on load (per-field validation)", () => {
    sessionStorage.setItem(
      "qkit:cart:b1",
      JSON.stringify([
        { menuItemId: "ok", quantity: 1 },
        { menuItemId: 42, quantity: 1 }, // bad id
        { menuItemId: "x", quantity: "nope" }, // bad qty
        null,
      ]),
    );
    expect(loadCart("b1")).toEqual([{ menuItemId: "ok", quantity: 1 }]);
  });

  it("tolerates garbage in storage", () => {
    sessionStorage.setItem("qkit:cart:b1", "not json");
    expect(loadCart("b1")).toEqual([]);
    sessionStorage.setItem("qkit:cart:b1", JSON.stringify({ not: "arr" }));
    expect(loadCart("b1")).toEqual([]);
  });

  it("swallows write failures (private mode / quota)", () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
      clear: () => {},
    };
    vi.stubGlobal("window", { sessionStorage: throwing });
    vi.stubGlobal("sessionStorage", throwing);
    expect(() => saveCart("b1", LINES)).not.toThrow();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("holdSessionId", () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  it("makes an id once and returns the same one after a refresh", () => {
    const first = holdSessionId("b1");
    expect(first).toMatch(UUID);
    expect(holdSessionId("b1")).toBe(first);
  });

  it("keeps a separate id per booth", () => {
    expect(holdSessionId("b1")).not.toBe(holdSessionId("b2"));
  });

  it("replaces a stored value that is not an id", () => {
    window.sessionStorage.setItem("qkit:hold:b1", "not-an-id");
    const id = holdSessionId("b1");
    expect(id).toMatch(UUID);
    expect(window.sessionStorage.getItem("qkit:hold:b1")).toBe(id);
  });

  it("still returns an id when storage throws", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(holdSessionId("b1")).toMatch(UUID);
  });
});
