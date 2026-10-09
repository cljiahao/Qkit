import { describe, expect, it } from "vitest";
import { localDemoBaseUrl } from "../scripts/demo/base-url.mjs";

describe("synthetic demo origin", () => {
  it("defaults to the local app", () => {
    expect(localDemoBaseUrl()).toBe("http://localhost:3000");
  });

  it.each([
    "http://localhost:3010/",
    "http://127.0.0.1:3000",
    "https://[::1]:3000",
  ])("allows loopback origin %s", (origin) =>
    expect(localDemoBaseUrl(origin)).toBe(new URL(origin).origin),
  );

  it.each([
    "https://qkit.merqo.io",
    "http://localhost.example.com",
    "http://localhost@evil.example",
    "http://user:password@localhost",
    "file:///tmp/demo",
    "http://localhost/demo",
    "http://localhost?target=production",
    "http://localhost#production",
    "invalid",
  ])("rejects unsafe demo target %s before browser writes", (origin) => {
    expect(() => localDemoBaseUrl(origin)).toThrow();
  });
});
