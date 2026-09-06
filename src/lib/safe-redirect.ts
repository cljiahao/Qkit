const CONTROL_CHARACTER = /[\x00-\x1f\x7f]/;

/**
 * Guards against an open redirect: accepts only a same-origin relative path
 * (leading "/", not "//" or "/\" — both browser-normalize to a protocol-relative
 * URL) with no embedded control characters (a TAB/LF/CR between the leading
 * "/" and the rest of the path is stripped by `URL`'s own parser, turning e.g.
 * "/\t/evil.example" into the protocol-relative "//evil.example"), falling
 * back to `fallback` otherwise.
 */
export function safeRedirectPath(
  next: string | null | undefined,
  fallback: string,
): string {
  if (
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\") &&
    !CONTROL_CHARACTER.test(next)
  ) {
    return next;
  }
  return fallback;
}
