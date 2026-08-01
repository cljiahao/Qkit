import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { createServerClient } = vi.hoisted(() => {
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } });
  const createServerClient = vi.fn().mockReturnValue({ auth: { getUser } });
  return { createServerClient };
});
vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { updateSession } from "./middleware";

describe("updateSession — legacy host-only cookie cleanup", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
    vi.clearAllMocks();
  });

  it("clears a pre-existing sb-*-auth-token cookie once when the cookie domain is enabled", async () => {
    process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = ".merqo.io";
    const request = new NextRequest("https://qkit.merqo.io/dashboard", {
      headers: { cookie: "sb-project-auth-token=stale-value" },
    });

    const response = await updateSession(request);

    const setCookies = response.cookies.getAll();
    const cleared = setCookies.find((c) => c.name === "sb-project-auth-token");
    expect(cleared?.value).toBe("");
    expect(cleared?.maxAge).toBe(0);

    const marker = setCookies.find(
      (c) => c.name === "sb-auth-cookie-domain-migrated",
    );
    expect(marker?.value).toBe("1");
  });

  it("does not clear again once the migration marker cookie is already present", async () => {
    process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = ".merqo.io";
    const request = new NextRequest("https://qkit.merqo.io/dashboard", {
      headers: {
        cookie:
          "sb-project-auth-token=fresh-value; sb-auth-cookie-domain-migrated=1",
      },
    });

    const response = await updateSession(request);

    const cleared = response.cookies
      .getAll()
      .find((c) => c.name === "sb-project-auth-token");
    expect(cleared).toBeUndefined();
  });

  it("does nothing when NEXT_PUBLIC_AUTH_COOKIE_DOMAIN is unset", async () => {
    const request = new NextRequest("https://qkit.merqo.io/dashboard", {
      headers: { cookie: "sb-project-auth-token=stale-value" },
    });

    const response = await updateSession(request);

    const cleared = response.cookies
      .getAll()
      .find((c) => c.name === "sb-project-auth-token");
    expect(cleared).toBeUndefined();
  });
});
