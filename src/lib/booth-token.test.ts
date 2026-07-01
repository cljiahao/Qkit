import { describe, it, expect } from "vitest";
import { isTokenValid, orderPath } from "./booth-token";

describe("isTokenValid", () => {
  it("accepts an exact match", () => {
    expect(isTokenValid("abc123", "abc123")).toBe(true);
  });
  it("rejects a mismatch", () => {
    expect(isTokenValid("abc123", "wrong")).toBe(false);
  });
  it("rejects a missing provided token", () => {
    expect(isTokenValid("abc123", undefined)).toBe(false);
    expect(isTokenValid("abc123", null)).toBe(false);
    expect(isTokenValid("abc123", "")).toBe(false);
  });
  it("rejects when the expected token is absent (never allow on empty)", () => {
    expect(isTokenValid(null, "anything")).toBe(false);
    expect(isTokenValid(undefined, "anything")).toBe(false);
    expect(isTokenValid("", "")).toBe(false);
  });
});

describe("orderPath", () => {
  it("builds the entry URL with the token as the k query param", () => {
    expect(orderPath("booth-1", "tok-AB_c")).toBe("/order/booth-1?k=tok-AB_c");
  });
  it("url-encodes the token", () => {
    expect(orderPath("b", "a b")).toBe("/order/b?k=a%20b");
  });
  it("url-encodes query-significant characters so a token can't break the URL", () => {
    // Real tokens are base64url (no special chars), but the encode must hold
    // regardless — pins encodeURIComponent against a weakened/no-op mutant.
    expect(orderPath("b", "a&b=c#d")).toBe("/order/b?k=a%26b%3Dc%23d");
  });
});
