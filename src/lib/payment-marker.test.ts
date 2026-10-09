import { describe, expect, it } from "vitest";
import { expectsPayment, paymentKindOf, paymentMarker } from "./payment-marker";

describe("paymentKindOf", () => {
  it.each(["paynow", "pointer", "stripe"] as const)(
    "reads a %s marker",
    (kind) => {
      expect(paymentKindOf({ kind })).toBe(kind);
    },
  );

  it("reads the kind off a full config as well as a bare marker", () => {
    expect(paymentKindOf({ kind: "paynow", payee_name: "Cart" })).toBe(
      "paynow",
    );
  });

  it.each([null, undefined, {}, { kind: "cash" }, { kind: 1 }, "paynow", []])(
    "is null for %j",
    (data) => {
      expect(paymentKindOf(data)).toBeNull();
    },
  );
});

describe("expectsPayment", () => {
  it("is true for the two live kinds", () => {
    expect(expectsPayment("paynow")).toBe(true);
    expect(expectsPayment("pointer")).toBe(true);
  });

  it("is false for no payment and for the reserved stripe kind", () => {
    expect(expectsPayment(null)).toBe(false);
    expect(expectsPayment("stripe")).toBe(false);
  });
});

describe("paymentMarker", () => {
  it("stores the two live kinds", () => {
    expect(paymentMarker("paynow")).toEqual({ kind: "paynow" });
    expect(paymentMarker("pointer")).toEqual({ kind: "pointer" });
  });

  it("stores nothing for no payment or stripe", () => {
    expect(paymentMarker(undefined)).toBeNull();
    expect(paymentMarker("stripe")).toBeNull();
  });

  it("round-trips through paymentKindOf", () => {
    expect(paymentKindOf(paymentMarker("pointer"))).toBe("pointer");
    expect(paymentKindOf(paymentMarker(undefined))).toBeNull();
  });
});
