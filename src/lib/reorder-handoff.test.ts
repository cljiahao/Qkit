import { beforeEach, describe, expect, it, vi } from "vitest";
import { stashReorder, takeReorder } from "./reorder-handoff";
import type { ReorderLine } from "./reorder";

// jsdom isn't configured for this suite (node env); stub a minimal sessionStorage.
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

const lines: ReorderLine[] = [{ menuItemId: "cookie", quantity: 2 }];

beforeEach(() => {
  vi.unstubAllGlobals();
  installStorage();
});

describe("reorder-handoff", () => {
  it("round-trips a stashed seed", () => {
    expect(stashReorder("b1", { lines, customerName: "Ada" })).toBe(true);
    expect(takeReorder("b1")).toEqual({ lines, customerName: "Ada" });
  });

  it("is read-once: a second take returns null", () => {
    stashReorder("b1", { lines });
    expect(takeReorder("b1")).toEqual({ lines });
    expect(takeReorder("b1")).toBeNull();
  });

  it("scopes seeds by booth", () => {
    stashReorder("b1", { lines });
    expect(takeReorder("b2")).toBeNull();
    expect(takeReorder("b1")).toEqual({ lines });
  });

  it("returns null for a missing seed", () => {
    expect(takeReorder("nope")).toBeNull();
  });

  it("returns null for garbage / malformed seeds", () => {
    sessionStorage.setItem("qkit:reorder:b1", "not json");
    expect(takeReorder("b1")).toBeNull();
    sessionStorage.setItem("qkit:reorder:b1", JSON.stringify({ no: "lines" }));
    expect(takeReorder("b1")).toBeNull();
  });

  it("swallows write failures (private mode / quota)", () => {
    const throwingSs = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
      clear: () => {},
    };
    vi.stubGlobal("window", { sessionStorage: throwingSs });
    vi.stubGlobal("sessionStorage", throwingSs);
    expect(stashReorder("b1", { lines })).toBe(false);
  });

  it("returns null/false when window is undefined (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(stashReorder("b1", { lines })).toBe(false);
    expect(takeReorder("b1")).toBeNull();
  });

  it("drops malformed lines (bad menuItemId / quantity), keeping valid ones", () => {
    sessionStorage.setItem(
      "qkit:reorder:b1",
      JSON.stringify({
        lines: [
          { menuItemId: "cookie", quantity: 2 },
          { menuItemId: 123, quantity: 2 }, // menuItemId not a string
          { menuItemId: "tea", quantity: "two" }, // quantity not a number
          { quantity: 1 }, // missing menuItemId
          null,
          "garbage",
        ],
      }),
    );
    expect(takeReorder("b1")).toEqual({
      lines: [{ menuItemId: "cookie", quantity: 2 }],
    });
  });

  it("drops a non-string customerName rather than trusting it", () => {
    sessionStorage.setItem(
      "qkit:reorder:b1",
      JSON.stringify({ lines, customerName: 12345 }),
    );
    expect(takeReorder("b1")).toEqual({ lines });
  });

  it("drops lines whose options entries are malformed", () => {
    sessionStorage.setItem(
      "qkit:reorder:b1",
      JSON.stringify({
        lines: [
          { menuItemId: "cookie", quantity: 1, options: [{ group: "Size" }] }, // missing choice
          { menuItemId: "tea", quantity: 1, options: "not-an-array" },
        ],
      }),
    );
    expect(takeReorder("b1")).toEqual({ lines: [] });
  });
});
