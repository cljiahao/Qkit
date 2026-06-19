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
});
