import { useEffect, useRef } from "react";

/**
 * Run `tick` every `intervalMs` while the tab is visible and `enabled` is true.
 *
 * Pauses when the tab is hidden (phone pocketed) so a backgrounded page doesn't
 * hammer the server, and fires an immediate tick on return so the view refreshes
 * the instant the user looks back — also catching any change between SSR and
 * hydration. Shared by the customer order-status and payment pollers (which used
 * to carry their own copies of this logic).
 *
 * `tick` is held in a ref, so passing a fresh closure each render does NOT
 * re-subscribe the interval; only intervalMs/enabled do.
 */
export function usePolling(
  tick: () => void | Promise<void>,
  { intervalMs, enabled }: { intervalMs: number; enabled: boolean },
) {
  const tickRef = useRef(tick);
  const inFlight = useRef(false);
  useEffect(() => {
    tickRef.current = tick;
  });

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | undefined;

    const run = () => {
      if (document.hidden || inFlight.current) return;
      inFlight.current = true;
      try {
        const result = tickRef.current();
        if (result) {
          result.then(
            () => {
              inFlight.current = false;
            },
            () => {
              inFlight.current = false;
            },
          );
        } else {
          inFlight.current = false;
        }
      } catch {
        // A failed refresh is retried on the next visible interval.
        inFlight.current = false;
      }
    };
    const start = () => {
      if (!timer) timer = setInterval(run, intervalMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        run();
        start();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) {
      run();
      start();
    }
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
