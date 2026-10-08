"use client";

import { useEffect, useRef, useState } from "react";
import {
  holdCart,
  readAvailability,
  type HoldLine,
} from "@/app/o/[code]/hold-actions";
import { holdSessionId } from "@/lib/cart-storage";
import { holdsApply, type Availability } from "@/lib/availability";

// Long enough that tapping + four times is one call, short enough that the
// next customer sees the stock move while this one is still choosing.
const HOLD_DEBOUNCE_MS = 500;
// How often an open menu re-reads what other baskets have taken or released.
const REFRESH_MS = 30_000;

/**
 * Keeps a customer's basket held against the booth's stock, and the menu's
 * view of what is left current. `initial` is what the server rendered (raw
 * stock, before anyone's hold); once the first hold call answers, the value
 * returned is net of other customers' baskets.
 *
 * Every basket change re-places the hold after a short debounce, which also
 * renews its five-minute life. The periodic refresh only reads, so a basket
 * left idle lets go of its stock. Does nothing for a booth with no finite
 * stock: there is nothing to hold and nothing that can change under the page.
 */
export function useCartAvailability(
  boothId: string,
  initial: Availability,
  lines: HoldLine[],
  // False for a booth that is not taking orders: nothing can be added, so
  // there is nothing to hold or to keep current.
  ordering = true,
) {
  const [availability, setAvailability] = useState(initial);
  const enabled = ordering && holdsApply(initial);
  const session = useRef<string | null>(null);
  // Answers can land out of order on a patchy connection; only the newest
  // request may set state, or a stale one would put back stock just taken.
  const newest = useRef(0);
  const linesKey = JSON.stringify(lines);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      session.current ??= holdSessionId(boothId);
      const request = ++newest.current;
      const held: HoldLine[] = JSON.parse(linesKey);
      holdCart(boothId, session.current, held)
        .then((next) => {
          if (next && request === newest.current) setAvailability(next);
        })
        .catch(() => undefined);
    }, HOLD_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [boothId, enabled, linesKey]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      session.current ??= holdSessionId(boothId);
      const request = ++newest.current;
      readAvailability(boothId, session.current)
        .then((next) => {
          if (next && request === newest.current) setAvailability(next);
        })
        .catch(() => undefined);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [boothId, enabled]);

  return {
    availability,
    // Read at submit, so placeOrder can release the hold with the order.
    holdSession: () => session.current ?? undefined,
  };
}
