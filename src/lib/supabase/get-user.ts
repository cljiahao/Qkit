import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * Current auth user, memoized per request (React.cache). The dashboard layout
 * and its page both resolve the user in the same request; without this each path
 * would issue its own auth.getUser() round-trip. cache() dedupes within a single
 * server render/action, and is a no-op across requests.
 */
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
