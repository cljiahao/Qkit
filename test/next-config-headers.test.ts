import { afterEach, describe, expect, it, vi } from "vitest";

// next.config.ts's headers() must not send X-Frame-Options: DENY or CSP
// frame-ancestors 'none' in dev — both apply during `next dev` too, and
// browsers enforce them even on localhost, which blocks any IDE preview
// pane that renders the app via <iframe>. Production keeps both.
describe("next.config headers()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function loadHeaders() {
    vi.resetModules();
    const mod = await import("../next.config");
    const config = mod.default;
    const rules = (await config.headers?.()) ?? [];
    return rules[0].headers as { key: string; value: string }[];
  }

  it("omits X-Frame-Options and frame-ancestors in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const headers = await loadHeaders();

    expect(headers.find((h) => h.key === "X-Frame-Options")).toBeUndefined();
    const csp = headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp?.value).not.toContain("frame-ancestors");
  });

  it("sends X-Frame-Options: DENY and frame-ancestors 'none' in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const headers = await loadHeaders();

    expect(headers.find((h) => h.key === "X-Frame-Options")?.value).toBe(
      "DENY",
    );
    const csp = headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp?.value).toContain("frame-ancestors 'none'");
  });
});
