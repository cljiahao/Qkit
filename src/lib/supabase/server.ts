import {
  createServerClient as createSSRClient,
  type CookieMethodsServer,
} from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

// Shared @supabase/ssr cookie adapter. The setAll catch covers the read-only
// Server Component context (session refresh is handled by middleware instead).
function cookieMethods(cookieStore: CookieStore): CookieMethodsServer {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      } catch {
        // Read-only context (Server Component) — session refresh handled by middleware
      }
    },
  };
}

export async function createServerClient() {
  const cookieStore = await cookies();

  return createSSRClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: cookieMethods(cookieStore) },
  );
}

// Uses the secret key — bypasses RLS. Only use in Server Actions/Route Handlers.
export async function createServiceClient() {
  const cookieStore = await cookies();

  return createSSRClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      cookies: cookieMethods(cookieStore),
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
