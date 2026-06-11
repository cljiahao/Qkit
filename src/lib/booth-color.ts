// Deterministic per-booth accent color. Same booth id always maps to the same
// hue, so a booth's dot on the order card and its filter tab match — no DB
// column, no config. Kept a quiet secondary channel: status color stays the
// dominant signal on a card, the booth color is only ever a small dot.
const BOOTH_COLORS = [
  "oklch(0.62 0.17 25)", // ember red
  "oklch(0.7 0.15 65)", // amber
  "oklch(0.64 0.13 150)", // green
  "oklch(0.62 0.11 215)", // teal
  "oklch(0.56 0.15 280)", // indigo
  "oklch(0.6 0.16 330)", // magenta
  "oklch(0.66 0.14 110)", // lime
  "oklch(0.52 0.1 40)", // cocoa
] as const;

/** Stable color for a booth id (a CSS oklch string from a fixed palette). */
export function boothColor(boothId: string): string {
  let hash = 0;
  for (let i = 0; i < boothId.length; i++) {
    hash = (hash * 31 + boothId.charCodeAt(i)) >>> 0;
  }
  return BOOTH_COLORS[hash % BOOTH_COLORS.length];
}
