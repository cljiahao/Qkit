"use client";

import { toast } from "sonner";

import {
  useAsyncAction as useSharedAsyncAction,
  navigatingAway,
} from "@merqo/ui";

/** Run a supplied handler; form callers can handle rejection with a retry toast. */
export function useAsyncAction(failureMessage?: string): {
  pending: boolean;
  error: unknown;
  run: (fn: () => Promise<void>) => Promise<void>;
  reset: () => void;
} {
  return useSharedAsyncAction(async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error) {
      if (!failureMessage) throw error;
      toast.error(failureMessage);
    }
  });
}

export { navigatingAway };
