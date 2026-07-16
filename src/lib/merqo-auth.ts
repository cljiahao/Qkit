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
 * Fetches auth users. Only page 1 (1000 users) — once qkit passes that many,
 * anything past this page silently drops out of every merqo lookup. Logs
 * when that ceiling is hit so it doesn't fail invisibly.
 */
export async function listAllAuthUsers(
  supabase: ServiceClient,
  logPrefix: string,
) {
  const usersRes = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (!usersRes.error && usersRes.data?.users.length === 1000) {
    console.error(
      `${logPrefix}: listUsers returned a full page (1000) — pagination not implemented, results past this page may be incomplete`,
    );
  }
  return usersRes;
}

export function findAuthUserByEmail<T extends { email?: string | null }>(
  users: T[],
  email: string,
): T | null {
  const key = email.toLowerCase();
  return users.find((u) => u.email?.toLowerCase() === key) ?? null;
}
