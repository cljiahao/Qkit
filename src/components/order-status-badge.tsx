import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/types";

const STATUS_CONFIG: Record<OrderStatus, { label: string; className: string }> =
  {
    pending: {
      label: "Pending",
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
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-[0.12em]",
        config.className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {config.label}
    </span>
  );
}
