import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addRecentOrder,
  getRecentOrders,
  getRecentOrdersForBooth,
} from "./recent-orders";

// jsdom isn't configured for this suite (node env), so stub a minimal
// localStorage on the global before each test.
function installStorage() {
  let store: Record<string, string> = {};
  const ls = {
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
  vi.stubGlobal("window", { localStorage: ls });
  vi.stubGlobal("localStorage", ls);
}

beforeEach(() => {
  vi.unstubAllGlobals();
  installStorage();
});

describe("recent-orders", () => {
  it("returns empty when nothing stored", () => {
    expect(getRecentOrders()).toEqual([]);
    expect(getRecentOrdersForBooth("b1")).toEqual([]);
  });

  it("adds and stamps placedAt, newest first", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    addRecentOrder({ boothId: "b1", orderNumber: "0001", customerName: "Ada" });
    vi.spyOn(Date, "now").mockReturnValue(2000);
    addRecentOrder({ boothId: "b1", orderNumber: "0002", customerName: "Bo" });

    const all = getRecentOrders();
    expect(all.map((o) => o.orderNumber)).toEqual(["0002", "0001"]);
    expect(all[0].placedAt).toBe(2000);
  });

  it("dedupes by booth + order number, keeping the latest", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    addRecentOrder({ boothId: "b1", orderNumber: "0001", customerName: "Ada" });
    vi.spyOn(Date, "now").mockReturnValue(5000);
    addRecentOrder({
      boothId: "b1",
      orderNumber: "0001",
      customerName: "Ada R.",
    });

    const all = getRecentOrders();
    expect(all).toHaveLength(1);
    expect(all[0].customerName).toBe("Ada R.");
    expect(all[0].placedAt).toBe(5000);
  });

  it("filters by booth", () => {
    addRecentOrder({ boothId: "b1", orderNumber: "0001", customerName: "Ada" });
    addRecentOrder({ boothId: "b2", orderNumber: "0009", customerName: "Bo" });
    expect(getRecentOrdersForBooth("b1").map((o) => o.orderNumber)).toEqual([
      "0001",
    ]);
    expect(getRecentOrdersForBooth("b2").map((o) => o.orderNumber)).toEqual([
      "0009",
    ]);
  });

  it("caps history at 10 entries", () => {
    for (let i = 1; i <= 15; i++) {
      vi.spyOn(Date, "now").mockReturnValue(i);
      addRecentOrder({
        boothId: "b1",
        orderNumber: String(i).padStart(4, "0"),
        customerName: "x",
      });
    }
    const all = getRecentOrders();
    expect(all).toHaveLength(10);
    // Newest (15) kept, oldest (1..5) dropped.
    expect(all[0].orderNumber).toBe("0015");
    expect(all.some((o) => o.orderNumber === "0005")).toBe(false);
  });

  it("swallows storage write failures (private mode / quota)", () => {
    const throwingLs = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
      clear: () => {},
    };
    vi.stubGlobal("window", { localStorage: throwingLs });
    vi.stubGlobal("localStorage", throwingLs);
    expect(() =>
      addRecentOrder({
        boothId: "b1",
        orderNumber: "0001",
        customerName: "Ada",
      }),
    ).not.toThrow();
  });

  it("tolerates garbage in storage", () => {
    localStorage.setItem("qkit:recent-orders", "not json");
    expect(getRecentOrders()).toEqual([]);
    localStorage.setItem("qkit:recent-orders", JSON.stringify({ not: "arr" }));
    expect(getRecentOrders()).toEqual([]);
    localStorage.setItem(
      "qkit:recent-orders",
      JSON.stringify([{ boothId: "b1" }, 42, null]),
    );
    // Malformed entries dropped.
    expect(getRecentOrders()).toEqual([]);
  });
});
