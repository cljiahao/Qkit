"use client";

import {
  useAsyncAction as useSharedAsyncAction,
  navigatingAway,
} from "@merqo/ui";

/**
 * A `pending` flag for an async handler that ALWAYS resets — even if the handler
 * throws. Thin adapter over `@merqo/ui`'s `useAsyncAction`, which binds one action
 * at hook-creation time — binding it here to "call whatever closure you're given"
 * reproduces this hook's original per-call-dynamic-closure shape exactly, so every
 * existing call site (`run(async () => { … })`) keeps working unchanged.
 *
 *   const { pending, run } = useAsyncAction();
 *   <Button disabled={pending} onClick={() => run(async () => { … })} />
 */
export function useAsyncAction(): {
  pending: boolean;
  error: unknown;
  run: (fn: () => Promise<void>) => Promise<void>;
  reset: () => void;
} {
  return useSharedAsyncAction((fn: () => Promise<void>) => fn());
}

export { navigatingAway };
