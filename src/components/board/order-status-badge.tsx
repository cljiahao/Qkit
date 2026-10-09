import { StatusBadge } from "@merqo/ui";
import type { OrderStatus } from "@/lib/types";

const STATUS_CONFIG: Record<OrderStatus, { label: string; className: string }> =
  {
    pending: {
      label: "Waiting for you",
      className:
        "text-status-pending border-status-pending/35 bg-status-pending/12",
    },
    confirmed: {
      label: "Confirmed",
      className:
        "text-status-confirmed border-status-confirmed/35 bg-status-confirmed/12",
    },
    preparing: {
      label: "Preparing",
      className:
        "text-status-preparing border-status-preparing/35 bg-status-preparing/12",
    },
    ready: {
      label: "Ready",
      className: "text-status-ready border-status-ready/35 bg-status-ready/12",
    },
    completed: {
      label: "Completed",
      className:
        "text-status-completed border-status-completed/35 bg-status-completed/12",
    },
    cancelled: {
      label: "Cancelled",
      className:
        "text-status-cancelled border-status-cancelled/35 bg-status-cancelled/12",
    },
  };

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <StatusBadge status={status} config={STATUS_CONFIG} />;
}
