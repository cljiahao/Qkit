import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
  }).format(cents / 100);
}

export function genOrderNumber(existingCount: number): string {
  return String(existingCount + 1).padStart(4, "0");
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
