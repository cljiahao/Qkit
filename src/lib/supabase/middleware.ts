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
  if (!isProtectedPath(request.nextUrl.pathname)) return supabaseResponse;

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
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
