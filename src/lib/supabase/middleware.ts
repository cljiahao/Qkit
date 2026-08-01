import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/types";

// Only these prefixes need a session; everything else (the landing page, the
// login page, and the whole anonymous customer ordering funnel — /o, /order)
// is public.
function isProtectedPath(path: string): boolean {
  return (
    path.startsWith("/dashboard") ||
    path.startsWith("/onboarding") ||
    path.startsWith("/admin")
  );
}

const MIGRATION_MARKER = "sb-auth-cookie-domain-migrated";

// One-time cleanup after enabling the shared .merqo.io cookie domain: a
// vendor already signed in has a HOST-ONLY Supabase auth cookie from before
// this change. Once this kit starts writing a Domain=.merqo.io cookie of the
// same name, both can exist in the jar at once, and the browser's cookie
// parser and Next's disagree on which same-named cookie wins (RFC 6265
// ordering ambiguity) — which can replay an already-used refresh token and
// trip Supabase's reuse detection. Clearing the host-only cookie once (no
// Domain attribute, so it can't touch the new domain-scoped one) forces a
// one-time re-login instead. Guarded by a host-only marker cookie so it
// fires once per browser per kit; no-op once AUTH_COOKIE_DOMAIN is unset.
// Read at call-time (not a module-level const) to match how client.ts and
// server.ts read NEXT_PUBLIC_AUTH_COOKIE_DOMAIN elsewhere in this kit.
function clearLegacyHostOnlyCookie(
  request: NextRequest,
  response: NextResponse,
) {
  const authCookieDomain = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
  if (!authCookieDomain || request.cookies.get(MIGRATION_MARKER)) return;
  request.cookies
    .getAll()
    .filter((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"))
    .forEach((c) => response.cookies.set(c.name, "", { path: "/", maxAge: 0 }));
  response.cookies.set(MIGRATION_MARKER, "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database, "qkit">(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
      db: { schema: "qkit" },
      cookieOptions: process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN
        ? { domain: process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN }
        : undefined,
    },
  );

  // The customer funnel is anonymous and hot — don't spend an auth round-trip
  // (or risk an auth-outage 500) on it. Only protected routes resolve the user.
  if (!isProtectedPath(request.nextUrl.pathname)) {
    clearLegacyHostOnlyCookie(request, supabaseResponse);
    return supabaseResponse;
  }

  let user: User | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Auth unreachable — degrade to "unauthenticated" and redirect to /login
    // rather than 500-ing a protected route.
    user = null;
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirectResponse = NextResponse.redirect(url);
    clearLegacyHostOnlyCookie(request, redirectResponse);
    return redirectResponse;
  }

  clearLegacyHostOnlyCookie(request, supabaseResponse);
  return supabaseResponse;
}
