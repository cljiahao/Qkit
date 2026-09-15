"use client";

import { useState, type ChangeEvent } from "react";
import { centsToDollarString, parseDollarsToCents } from "@/lib/utils";

function format(cents: number | undefined): string {
  return cents == null ? "" : centsToDollarString(cents);
}

/**
 * Props for a controlled $-amount <Input>. Reformats to the canonical
 * 2-decimal string only on blur (or on an external `cents` change while
 * unfocused) instead of every keystroke -- reformatting live resets the
 * caret to the end after each key, so typing "6.50" left-to-right lands
 * as "6.01" (each digit gets appended past the fixed decimal point).
 */
export function useMoneyField(
  cents: number | undefined,
  onCommit: (cents: number | undefined) => void,
) {
  const [text, setText] = useState(() => format(cents));
  const [lastCents, setLastCents] = useState(cents);
  const [focused, setFocused] = useState(false);

  // Resync from an external cents change while unfocused, adjusted during
  // render (React's documented pattern) rather than in an effect -- avoids
  // an extra commit-then-effect render pass for a plain prop mirror.
  if (!focused && cents !== lastCents) {
    setLastCents(cents);
    setText(format(cents));
  }

  return {
    value: text,
    onFocus: () => setFocused(true),
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setText(raw);
      const parsed = parseDollarsToCents(raw);
      if (parsed.ok) onCommit(parsed.cents);
    },
    onBlur: () => {
      setFocused(false);
      setText(format(cents));
    },
  };
}
