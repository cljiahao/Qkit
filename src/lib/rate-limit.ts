import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

/**
 * Resolve a best-effort client IP from request headers: the first hop of
 * `x-forwarded-for`, else `x-real-ip`, else the literal "unknown". This is NOT
 * trusted (either header is client-spoofable behind a permissive proxy) — it's
 * a coarse fairness key for the flood guard, not an authz signal. Trusted-proxy
 * hardening (only honour XFF from known proxy IPs) is a separate task.
 */
export function clientIp(hdrs: Headers): string {
  return (
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Fixed-window rate-limit check via the DB limiter (`check_rate_limit`). Returns
 * true when the call is allowed. Fails OPEN — any limiter error (infra hiccup)
 * yields `true` so a real customer is never blocked by a degraded limiter. The
 * limiter is defence against floods, not a correctness gate.
 */
export async function rateLimit(
  supabase: SupabaseClient<Database>,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data: allowed, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  // Fail open, but don't fail SILENT — a degraded limiter is invisible
  // otherwise (the flood guard would quietly stop guarding).
  if (error) console.error("rateLimit degraded (failing open)", error.message);
  return allowed !== false;
}
