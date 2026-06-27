"use client";

import { useEffect, useState } from "react";

/**
 * Current epoch ms, re-rendering every `intervalMs` so "time ago" / countdown UI
 * stays live. Pass `enabled = false` to stop ticking (e.g. once an order is
 * terminal). Seeded from `Date.now()`; consumers that render an absolute clock
 * should format via the SGT helpers in `@/lib/tz` to stay hydration-safe.
 */
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);

  return now;
}
