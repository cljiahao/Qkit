import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time bearer check against PRINTKIT_CALLBACK_SECRET. A plain
 * shared secret, NO kit_slug prefix — mirrors src/lib/merqo-auth.ts's
 * bearerOk() exactly (own dedicated env var per endpoint, same reasoning:
 * qkit has exactly one caller for this route). Do not generalize this into
 * a shared helper with bearerOk/provisionBearerOk — each guards a
 * different capability behind its own secret, deliberately, per
 * merqo-auth.ts's own documented rationale.
 */
export function printkitCallbackBearerOk(request: Request): boolean {
  const secret = process.env.PRINTKIT_CALLBACK_SECRET;
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
