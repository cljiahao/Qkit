import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("passes a plain relative path through", () => {
    expect(safeRedirectPath("/dashboard/settings", "/dashboard")).toBe(
      "/dashboard/settings",
    );
  });

  it("falls back for an absolute URL", () => {
    expect(safeRedirectPath("https://evil.example", "/dashboard")).toBe(
      "/dashboard",
    );
  });

  it("falls back for a protocol-relative path", () => {
    expect(safeRedirectPath("//evil.example", "/dashboard")).toBe("/dashboard");
  });

  it("falls back for a backslash-prefixed path", () => {
    expect(safeRedirectPath("/\\evil.example", "/dashboard")).toBe(
      "/dashboard",
    );
  });

  it("falls back for a path containing a control character", () => {
    expect(safeRedirectPath("/dash\tboard", "/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/dash\nboard", "/dashboard")).toBe("/dashboard");
  });

  it("falls back for null / undefined / empty and non-slash input", () => {
    expect(safeRedirectPath(null, "/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath(undefined, "/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("", "/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("dashboard", "/dashboard")).toBe("/dashboard");
  });
});
