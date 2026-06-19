import type { ReorderLine } from "@/lib/reorder";

// Hand a reorder from one route (status page / recent-orders list) to the booth
// menu. sessionStorage (not localStorage): a reorder is a one-trip intent, not
// device history — it should not survive the tab. Read-once, then cleared.

const PREFIX = "qkit:reorder:";

export type ReorderSeed = {
  lines: ReorderLine[];
  customerName?: string;
};

export function stashReorder(boothId: string, seed: ReorderSeed): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.sessionStorage.setItem(PREFIX + boothId, JSON.stringify(seed));
    return true;
  } catch {
    // Storage unavailable (private mode / quota) — caller still navigates to a
    // fresh menu, so reorder degrades to "order again".
    return false;
  }
}

export function takeReorder(boothId: string): ReorderSeed | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PREFIX + boothId);
    if (!raw) return null;
    // Consume immediately so a refresh doesn't re-seed the cart.
    window.sessionStorage.removeItem(PREFIX + boothId);
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray((parsed as ReorderSeed).lines)
    ) {
      return null;
    }
    return parsed as ReorderSeed;
  } catch {
    return null;
  }
}
