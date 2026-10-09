import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CookieMethodsServer } from "@supabase/ssr";

const { factory, cookieStore, getCookies } = vi.hoisted(() => ({
  factory: vi.fn(),
  cookieStore: { getAll: vi.fn(), set: vi.fn() },
  getCookies: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: factory }));
vi.mock("next/headers", () => ({ cookies: getCookies }));
import { createServerClient, createServiceClient } from "./server";

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_AUTH_COOKIE_DOMAIN", "");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-service-key");
  factory.mockReset().mockReturnValue({ marker: "client" });
  getCookies.mockReset().mockResolvedValue(cookieStore);
  cookieStore.getAll
    .mockReset()
    .mockReturnValue([{ name: "session", value: "user-cookie" }]);
  cookieStore.set.mockReset();
});

function options() {
  return factory.mock.calls[0][2] as {
    cookies: CookieMethodsServer;
    cookieOptions?: { domain: string };
    db: { schema: string };
    auth?: { autoRefreshToken: boolean; persistSession: boolean };
  };
}

describe("Supabase server clients", () => {
  it("uses the user cookie adapter and qkit schema for session queries", async () => {
    expect(await createServerClient()).toEqual({ marker: "client" });
    const config = options();
    expect(config.db.schema).toBe("qkit");
    expect(config.cookieOptions).toBeUndefined();
    expect(await config.cookies.getAll()).toEqual([
      { name: "session", value: "user-cookie" },
    ]);
    config.cookies.setAll?.(
      [{ name: "session", value: "refreshed", options: { httpOnly: true } }],
      {},
    );
    expect(cookieStore.set).toHaveBeenCalledWith("session", "refreshed", {
      httpOnly: true,
    });
  });

  it("applies an explicitly configured shared cookie domain", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_COOKIE_DOMAIN", ".merqo.example");
    await createServerClient();
    expect(options().cookieOptions).toEqual({ domain: ".merqo.example" });
  });

  it("permits read-only Server Component contexts without failing a query", async () => {
    cookieStore.set.mockImplementation(() => {
      throw new Error("Read-only cookies");
    });
    await createServerClient();
    expect(() =>
      options().cookies.setAll?.(
        [{ name: "session", value: "new", options: {} }],
        {},
      ),
    ).not.toThrow();
  });

  it("never hydrates the service client with request cookies or persistent sessions", async () => {
    await createServiceClient();
    const config = options();
    expect(factory.mock.calls[0][1]).toBe("test-service-key");
    expect(getCookies).not.toHaveBeenCalled();
    expect(await config.cookies.getAll()).toEqual([]);
    config.cookies.setAll?.(
      [{ name: "session", value: "ignored", options: {} }],
      {},
    );
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(config.auth).toEqual({
      autoRefreshToken: false,
      persistSession: false,
    });
    expect(config.db.schema).toBe("qkit");
  });

  it("fails before constructing a service client when its credential is missing", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    await expect(createServiceClient()).rejects.toThrow(
      "Missing required environment variable: SUPABASE_SECRET_KEY",
    );
    expect(factory).not.toHaveBeenCalled();
  });
});
