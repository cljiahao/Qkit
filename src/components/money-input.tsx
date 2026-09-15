"use client";

import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { useMoneyField } from "@/hooks/use-money-field";

/**
 * A controlled $-amount <Input>. Wraps useMoneyField as its own component so
 * the hook is always called at a real component's top level -- callers that
 * render this from inside a .map() or a render-prop can't accidentally trip
 * react-hooks/rules-of-hooks the way calling the hook directly there would.
 */
export function MoneyInput({
  cents,
  onCommit,
  ...inputProps
}: {
  cents: number | undefined;
  onCommit: (cents: number | undefined) => void;
} & Omit<
  ComponentProps<typeof Input>,
  "value" | "onChange" | "onFocus" | "onBlur"
>) {
  const field = useMoneyField(cents, onCommit);
  return <Input inputMode="decimal" {...inputProps} {...field} />;
}
