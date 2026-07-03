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
