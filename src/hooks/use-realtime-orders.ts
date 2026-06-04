'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Order } from '@/lib/types';

export function useRealtimeOrders(boothIds: string[], initialOrders: Order[]) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const supabase = createClient();
  const filterString = useMemo(() => boothIds.join(','), [boothIds]);

  useEffect(() => {
    if (boothIds.length === 0) return;

    const channel = supabase
      .channel('vendor-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `booth_id=in.(${filterString})`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setOrders((prev) => [payload.new as Order, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setOrders((prev) =>
              prev.map((o) =>
                o.id === (payload.new as Order).id ? (payload.new as Order) : o
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setOrders((prev) =>
              prev.filter((o) => o.id !== (payload.old as { id: string }).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterString]);

  return orders;
}
