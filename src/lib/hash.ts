import { createHash } from "node:crypto";

/** SHA-256 hex digest of a buffer — matches this repo's existing node:crypto
 * hashing convention (see legal/accept/actions.ts's sha256), not the global
 * Web Crypto `crypto.subtle` API. */
export async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
  return createHash("sha256").update(Buffer.from(buffer)).digest("hex");
}
