"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ReceiptText } from "lucide-react";
import { getRecentOrdersForBooth, type RecentOrder } from "@/lib/recent-orders";
import { ReorderButton } from "@/components/reorder-button";

interface Props {
  boothId: string;
}

// Show this many before the "Show all" toggle — the list is capped at 10, so
// this only collapses the longer tail.
const COLLAPSED = 3;

export function RecentOrders({ boothId }: Props) {
  // Read after mount only — localStorage is unavailable during SSR and would
  // otherwise cause a hydration mismatch.
  const [orders, setOrders] = useState<RecentOrder[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    // Intentional post-mount read of a browser-only store (localStorage); the
    // server has no customer identity, so this can only run client-side.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrders(getRecentOrdersForBooth(boothId));
  }, [boothId]);

  if (!orders || orders.length === 0) return null;

  const visible = showAll ? orders : orders.slice(0, COLLAPSED);
  const hidden = orders.length - visible.length;

  return (
    <section className="mb-7 rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <ReceiptText className="size-3.5" />
        Your orders here
      </h2>
      <ul className="space-y-1.5">
        {visible.map((o) => (
          <li
            key={o.orderNumber}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
          >
            <Link
              href={`/order/${boothId}/${o.orderNumber}`}
              className="group flex min-w-0 flex-1 items-center justify-between gap-3 text-sm"
            >
              <span className="truncate">
                <span className="font-mono font-semibold text-primary">
                  #{o.orderNumber}
                </span>{" "}
                <span className="text-muted-foreground">
                  for {o.customerName}
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-4 group-hover:underline">
                Track →
              </span>
            </Link>
            {o.items && o.items.length > 0 && (
              <ReorderButton
                boothId={boothId}
                lines={o.items}
                customerName={o.customerName}
                size="sm"
                className="h-8 shrink-0 rounded-lg px-2.5 text-xs"
              />
            )}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2.5 flex w-full items-center justify-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          Show all ({orders.length})
          <ChevronDown className="size-3.5" />
        </button>
      )}
    </section>
  );
}
