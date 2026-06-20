import { shortDay } from "@/lib/tz";

// A paid pass (license) doubles as a named "event" the vendor can revisit.
export type EventLicense = {
  id: string;
  label: string | null;
  valid_from: string;
  expires_at: string;
};

/**
 * Display name for an event: the vendor's own label, else a dated default like
 * "Pass · 7 Jun". Whitespace-only labels fall back to the default.
 */
export function eventLabel(
  lic: Pick<EventLicense, "label" | "valid_from">,
): string {
  const trimmed = lic.label?.trim();
  return trimmed ? trimmed : `Pass · ${shortDay(Date.parse(lic.valid_from))}`;
}
