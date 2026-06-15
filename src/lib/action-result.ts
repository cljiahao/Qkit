/**
 * Discriminated result returned by Server Actions. The success branch carries
 * any extra payload via T (e.g. `{ boothId }` or `{ orderNumber }`); the
 * failure branch always carries a user-facing `error` string.
 */
export type ActionResult<T = object> =
  | ({ success: true } & T)
  | { success: false; error: string };
