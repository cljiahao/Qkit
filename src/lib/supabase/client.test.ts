import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn().mockReturnValue({}),
}));

import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "./client";

describe("createClient — shared-session cookie domain", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
    vi.clearAllMocks();
  });

  it("scopes the auth cookie to .merqo.io when NEXT_PUBLIC_AUTH_COOKIE_DOMAIN is set", () => {
    process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = ".merqo.io";
    createClient();
    const options = vi.mocked(createBrowserClient).mock.calls[0]?.[2] as any;
    expect(options.cookieOptions).toEqual({ domain: ".merqo.io" });
  });

  it("omits cookieOptions.domain when NEXT_PUBLIC_AUTH_COOKIE_DOMAIN is unset (dev/preview)", () => {
    createClient();
    const options = vi.mocked(createBrowserClient).mock.calls[0]?.[2] as any;
    expect(options.cookieOptions).toBeUndefined();
  });
});
