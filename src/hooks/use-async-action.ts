import { useState, useCallback } from "react";

/**
 * A `pending` flag for an async handler that ALWAYS resets — even if the handler
 * throws (a server action rejecting on a network error). Replaces the hand-rolled
 * `setBusy(true) … await … setBusy(false)` pattern, several copies of which left
 * the button stuck-disabled on a throw (the reset never ran).
 *
 *   const { pending, run } = useAsyncAction();
 *   <Button disabled={pending} onClick={() => run(async () => { … })} />
 */
export function useAsyncAction(): {
  pending: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
} {
  const [pending, setPending] = useState(false);
  const run = useCallback(async (fn: () => Promise<void>) => {
    setPending(true);
    try {
      await fn();
    } finally {
      setPending(false);
    }
  }, []);
  return { pending, run };
}

/**
 * `router.push`/`router.replace` fire the navigation without waiting for it to
 * land, so `fn()` returning right after one lets `run`'s `finally` flip
 * `pending` back to false while the old page is still showing — the button
 * re-enables mid-transition. `await navigatingAway()` at the end of a
 * success-and-navigate branch keeps `pending` true forever; the component
 * unmounts once the new route lands, so the promise never needs to resolve.
 */
export function navigatingAway(): Promise<never> {
  return new Promise(() => {});
}
