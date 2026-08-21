import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { printkitCallbackBearerOk } from "./qkit-printkit-auth";

const originalEnv = { ...process.env };

function requestWith(authorization: string | null) {
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return new Request("https://qkit.test/api/printkit/print-status", {
    headers,
  });
}

describe("printkitCallbackBearerOk", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns false when PRINTKIT_CALLBACK_SECRET is unset", () => {
    delete process.env.PRINTKIT_CALLBACK_SECRET;
    expect(printkitCallbackBearerOk(requestWith("Bearer anything"))).toBe(
      false,
    );
  });

  it("returns false with no authorization header", () => {
    process.env.PRINTKIT_CALLBACK_SECRET = "shared-secret";
    expect(printkitCallbackBearerOk(requestWith(null))).toBe(false);
  });

  it("returns false when the secret doesn't match", () => {
    process.env.PRINTKIT_CALLBACK_SECRET = "shared-secret";
    expect(printkitCallbackBearerOk(requestWith("Bearer wrong-secret"))).toBe(
      false,
    );
  });

  it("returns true when the secret matches exactly", () => {
    process.env.PRINTKIT_CALLBACK_SECRET = "shared-secret";
    expect(printkitCallbackBearerOk(requestWith("Bearer shared-secret"))).toBe(
      true,
    );
  });
});
