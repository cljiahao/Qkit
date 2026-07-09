import { orderRowSchema } from "@/lib/schemas";
import type { BoardOrder } from "@/lib/types";

/** A validated realtime change, ready to fold into the order list. */
export type RealtimeOrderEvent =
  | { type: "DELETE"; id: string }
  | { type: "INSERT"; order: BoardOrder }
  | { type: "UPDATE"; order: BoardOrder };

/** The slice of a Supabase realtime payload this module reads. */
export type RawOrderChange = {
  eventType: string;
  new: unknown;
  old: { id?: unknown };
};

/**
 * Validate an untrusted realtime payload into a typed event, or null to drop it.
 * DELETE needs only a string id from `old`; INSERT/UPDATE must pass the full
 * order schema (`new` is untrusted). Anything else (bad parse, missing id,
 * unknown eventType) → null.
 */
export function parseRealtimeOrderEvent(
  payload: RawOrderChange,
): RealtimeOrderEvent | null {
  if (payload.eventType === "DELETE") {
    const id = payload.old?.id;
    return typeof id === "string" ? { type: "DELETE", id } : null;
  }
  const parsed = orderRowSchema.safeParse(payload.new);
  if (!parsed.success) return null;
  // Postgres replication broadcasts the full row regardless of any REST-side
  // column selection — strip the customer's status-page secret here so it
  // never lands in the board's state, closing the one path column-narrowing
  // the REST queries can't.
  const { access_token: _accessToken, ...order } = parsed.data;
  if (payload.eventType === "INSERT") {
    return { type: "INSERT", order };
  }
  if (payload.eventType === "UPDATE") {
    return { type: "UPDATE", order };
  }
  return null;
}

/**
 * Fold a validated event into the order list. DELETE removes by id, INSERT
 * prepends (newest first), UPDATE replaces in place. Pure — no dedupe or
 * sorting beyond what the board already relies on.
 */
export function applyRealtimeOrderEvent(
  prev: BoardOrder[],
  event: RealtimeOrderEvent,
): BoardOrder[] {
  switch (event.type) {
    case "DELETE":
      return prev.filter((o) => o.id !== event.id);
    case "INSERT":
      return [event.order, ...prev];
    case "UPDATE":
      return prev.map((o) => (o.id === event.order.id ? event.order : o));
  }
}
