import { OrderStatusBadge } from "@/components/order-status-badge";
import { Paginated } from "@/components/paginated";
import { elapsedLabel } from "@/lib/orders";
import type { StuckOrder } from "@/lib/stuck-orders";

/**
 * Operational alert list: orders sitting in a non-terminal status well past
 * a same-day F&B queue's normal window (see `findStuckOrders`,
 * `@/lib/stuck-orders`). Same row/section visual language as the Upgrade
 * requests / Help requests inboxes above it in `page.tsx`. Renders nothing
 * when there's nothing stuck.
 */
export function StuckOrdersSection({
  stuckOrders,
  boothNameById,
}: {
  stuckOrders: StuckOrder[];
  boothNameById: Map<string, string>;
}) {
  if (stuckOrders.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Stuck orders · {stuckOrders.length}
      </h2>
      <Paginated pageSize={8} className="space-y-2">
        {stuckOrders.map((o) => (
          <div
            key={o.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-status-cancelled/30 bg-status-cancelled/[0.04] px-4 py-3 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {boothNameById.get(o.booth_id) ?? "Unknown booth"}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                Stuck since {elapsedLabel(o.stuckForMs)}
              </p>
            </div>
            <OrderStatusBadge status={o.status} />
          </div>
        ))}
      </Paginated>
    </section>
  );
}
