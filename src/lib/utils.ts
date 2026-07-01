import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Milliseconds in one hour. Shared by hourly stats bucketing. */
export const MS_PER_HOUR = 3_600_000;

/** Milliseconds in one day. Shared by rolling-window stats cutoffs. */
export const MS_PER_DAY = 86_400_000;

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
  }).format(cents / 100);
}

export function genOrderNumber(existingCount: number): string {
  return String(existingCount + 1).padStart(4, "0");
}

/**
 * Parse a user-typed dollar string into integer cents for storage.
 * `""` → ok with `undefined` (field cleared); a valid non-negative number → ok
 * with rounded cents; anything else (NaN, negative) → not ok, so the caller
 * rejects the keystroke and keeps the prior value.
 */
export function parseDollarsToCents(
  raw: string,
): { ok: true; cents: number | undefined } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, cents: undefined };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return { ok: false };
  return { ok: true, cents: Math.round(value * 100) };
}

/** True when at least one item carries a price (drives whether money is shown). */
export function orderHasPricing(
  items: { price_cents?: number | null }[],
): boolean {
  return items.some((i) => i.price_cents != null);
}

/** Render selected options as a single muted line, e.g. "Iced · Less". Empty when none. */
export function formatOptions(options?: { choice: string }[] | null): string {
  return options && options.length
    ? options.map((o) => o.choice).join(" · ")
    : "";
}
