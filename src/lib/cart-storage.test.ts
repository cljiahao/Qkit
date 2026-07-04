import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveCart, loadCart, clearCart } from "./cart-storage";
import type { ReorderLine } from "./reorder";

// jsdom isn't configured for this suite (node env), so stub a minimal
// sessionStorage on the global before each test (mirrors recent-orders.test).
function installStorage() {
  let store: Record<string, string> = {};
  const ss = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
  vi.stubGlobal("window", { sessionStorage: ss });
  vi.stubGlobal("sessionStorage", ss);
}

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
  installStorage();
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
