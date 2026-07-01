import type { ReorderLine } from "@/lib/reorder";
import type { SelectedOption } from "@/lib/types";

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

// A line survives only if it carries a string menuItemId, a numeric quantity,
// and (when present) a well-formed options array — mirrors the per-field
// rigor recent-orders.ts applies to its own sessionStorage/localStorage reads,
// rather than trusting the cast.
function isValidLine(value: unknown): value is ReorderLine {
  if (!value || typeof value !== "object") return false;
  const line = value as Record<string, unknown>;
  if (typeof line.menuItemId !== "string") return false;
  if (typeof line.quantity !== "number" || !Number.isFinite(line.quantity)) {
    return false;
  }
  if (line.options !== undefined) {
    if (!Array.isArray(line.options)) return false;
    const validOptions = line.options.every(
      (o): o is SelectedOption =>
        !!o &&
        typeof o === "object" &&
        typeof (o as SelectedOption).group === "string" &&
        typeof (o as SelectedOption).choice === "string",
    );
    if (!validOptions) return false;
  }
  return true;
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
    const candidate = parsed as ReorderSeed;
    const validLines = candidate.lines.filter(isValidLine);
    return typeof candidate.customerName === "string"
      ? { lines: validLines, customerName: candidate.customerName }
      : { lines: validLines };
  } catch {
    return null;
  }
}
