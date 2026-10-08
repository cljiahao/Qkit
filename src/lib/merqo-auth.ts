import { timingSafeEqual } from "node:crypto";
import type { createServiceClient } from "@/lib/supabase/server";

/** Constant-time bearer check against MERQO_METRICS_SECRET. */
export function bearerOk(request: Request): boolean {
  const secret = process.env.MERQO_METRICS_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * Fetch every auth page so later shared-auth accounts remain discoverable.
 * A failed page fails the whole lookup rather than reporting a false absence.
 */
export async function listAllAuthUsers(
  supabase: ServiceClient,
  logPrefix: string,
) {
  const perPage = 1000;
  let page = 1;
  let usersRes = await supabase.auth.admin.listUsers({ page, perPage });
  if (usersRes.error) return usersRes;
  const users = [...usersRes.data.users];
  while (usersRes.data.users.length === perPage) {
    page += 1;
    usersRes = await supabase.auth.admin.listUsers({ page, perPage });
    if (usersRes.error) {
      console.error(
        `${logPrefix}: auth user pagination failed`,
        usersRes.error.message,
      );
      return usersRes;
    }
    users.push(...usersRes.data.users);
  }
  return { ...usersRes, data: { ...usersRes.data, users } };
}

export function findAuthUserByEmail<T extends { email?: string | null }>(
  users: T[],
  email: string,
): T | null {
  const key = email.toLowerCase();
  return users.find((u) => u.email?.toLowerCase() === key) ?? null;
}

/** Constant-time bearer check against MERQO_PROVISION_SECRET — deliberately
 *  a DIFFERENT env var from bearerOk's MERQO_METRICS_SECRET. This guards a
 *  write endpoint (creates a real tenant row); a leak of the routine
 *  metrics-polling secret must not also grant that capability. */
export function provisionBearerOk(request: Request): boolean {
  const secret = process.env.MERQO_PROVISION_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
