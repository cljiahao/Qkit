import type { ReorderLine } from "@/lib/reorder";
import { isValidLine } from "@/lib/reorder-handoff";

// Persist the in-progress cart so a page refresh or mobile tab-eviction (iOS
// aggressively reloads backgrounded tabs) doesn't wipe a half-built order.
// sessionStorage, not localStorage: a cart belongs to the current ordering
// session — it should survive a reload but not outlive the tab as stale device
// history. Keyed per booth. Stored as compact reorder lines so a restore
// reconciles against the LIVE menu + stock (see reconcileReorder), never a
// stale price/availability snapshot. Best-effort: private mode / quota simply
// means the cart won't survive a refresh, no worse than before.

const PREFIX = "qkit:cart:";

export function saveCart(boothId: string, lines: ReorderLine[]): void {
  if (typeof window === "undefined") return;
  try {
    // An empty cart clears the key rather than storing "[]" — a restore of
    // nothing is the same as no saved cart, so keep storage tidy.
    if (lines.length === 0) {
      window.sessionStorage.removeItem(PREFIX + boothId);
      return;
    }
    window.sessionStorage.setItem(PREFIX + boothId, JSON.stringify(lines));
  } catch {
    // Storage unavailable — degrade silently.
  }
}

export function loadCart(boothId: string): ReorderLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(PREFIX + boothId);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidLine);
  } catch {
    return [];
  }
}

const HOLD_PREFIX = "qkit:hold:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The random id this tab's basket holds stock under (qkit.cart_holds,
 * migration 0096). Stored beside the cart so a refresh keeps the same id:
 * a fresh one would leave the old hold standing for its five minutes and the
 * customer would see their own items as taken by someone else. Identifies a
 * basket, never a person. With storage unavailable the id lasts one page load,
 * which costs only that refresh case.
 */
export function holdSessionId(boothId: string): string {
  const fresh = crypto.randomUUID();
  if (typeof window === "undefined") return fresh;
  try {
    const saved = window.sessionStorage.getItem(HOLD_PREFIX + boothId);
    if (saved && UUID.test(saved)) return saved;
    window.sessionStorage.setItem(HOLD_PREFIX + boothId, fresh);
  } catch {
    // Storage unavailable: use the one-off id.
  }
  return fresh;
}

export function clearCart(boothId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PREFIX + boothId);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
