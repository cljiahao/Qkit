"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { getRecentOrdersForBooth, type RecentOrder } from "@/lib/recent-orders";

interface Props {
  boothId: string;
}

export function RecentOrders({ boothId }: Props) {
  // Read after mount only — localStorage is unavailable during SSR and would
  // otherwise cause a hydration mismatch.
  const [orders, setOrders] = useState<RecentOrder[] | null>(null);

  useEffect(() => {
    // Intentional post-mount read of a browser-only store (localStorage); the
    // server has no customer identity, so this can only run client-side.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrders(getRecentOrdersForBooth(boothId));
  }, [boothId]);

  if (!orders || orders.length === 0) return null;

  return (
    <section className="mb-7 rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <ReceiptText className="size-3.5" />
        Your orders here
      </h2>
      <ul className="space-y-1.5">
        {orders.map((o) => (
          <li key={o.orderNumber}>
            <Link
              href={`/order/${boothId}/${o.orderNumber}`}
              className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:border-primary/50"
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
          </li>
        ))}
      </ul>
    </section>
  );
}
