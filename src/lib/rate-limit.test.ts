import { describe, expect, it } from "vitest";
import { clientIp } from "./rate-limit";

function hdrs(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("clientIp", () => {
  it("takes the first hop of x-forwarded-for", () => {
    expect(
      clientIp(hdrs({ "x-forwarded-for": "203.0.113.5, 70.41.3.18" })),
    ).toBe("203.0.113.5");
  });

  it("trims whitespace around the first hop", () => {
    expect(
      clientIp(hdrs({ "x-forwarded-for": "  203.0.113.5 , 70.41.3.18" })),
    ).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    expect(clientIp(hdrs({ "x-real-ip": "198.51.100.7" }))).toBe(
      "198.51.100.7",
    );
  });

  it("falls back to x-real-ip when x-forwarded-for is empty", () => {
    expect(
      clientIp(hdrs({ "x-forwarded-for": "", "x-real-ip": "198.51.100.7" })),
    ).toBe("198.51.100.7");
  });

  it("returns 'unknown' when neither header is present", () => {
    expect(clientIp(hdrs({}))).toBe("unknown");
  });
});
