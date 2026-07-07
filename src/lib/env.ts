/**
 * Validated public environment. Reading a missing env var used to surface as a
 * cryptic failure deep inside supabase-js (`createClient(undefined, …)`); this
 * fails fast at first import with a clear "which var is missing" message
 * instead. Principle borrowed from t3-env (server/client split, fail-fast) but
 * hand-rolled — three vars don't warrant a dependency.
 *
 * CLIENT-SAFE: only `NEXT_PUBLIC_*` values live here, so this module may be
 * imported from client components. The service-role secret is validated
 * separately, inline in the server-only `createServiceClient`, and never enters
 * this file — keeping the "no secrets outside server code" rule intact.
 *
 * The references below are written literally (`process.env.NEXT_PUBLIC_X`) so
 * Next.js still inlines them at build time; a dynamic `process.env[name]` lookup
 * would not be inlined.
 */
function req(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const publicEnv = {
  supabaseUrl: req(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  supabasePublishableKey: req(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
} as const;
