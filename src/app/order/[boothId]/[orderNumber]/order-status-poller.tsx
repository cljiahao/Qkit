'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { OrderStatusBadge } from '@/components/order-status-badge';
import type { OrderStatus } from '@/lib/types';

interface Props {
  boothId: string;
  orderNumber: string;
  initialStatus: OrderStatus;
}

const STATUS_MESSAGE: Record<OrderStatus, string> = {
  pending:   'Your order is being reviewed',
  confirmed: 'Your order has been confirmed',
  preparing: 'Your order is being prepared',
  ready:     'Your order is ready for pickup!',
  completed: 'Order complete — enjoy!',
  cancelled: 'Your order was cancelled',
};

export function OrderStatusPoller({ boothId, orderNumber, initialStatus }: Props) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel(`order-${boothId}-${orderNumber}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `booth_id=eq.${boothId}`,
        },
        (payload) => {
          const updated = payload.new as { order_number: string; status: OrderStatus };
          if (updated.order_number === orderNumber) {
            setStatus(updated.status);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boothId, orderNumber]);

  return (
    <div className="text-center space-y-3">
      <OrderStatusBadge status={status} />
      <p className="text-sm text-muted-foreground">{STATUS_MESSAGE[status]}</p>
      {status === 'ready' && (
        <p className="font-semibold text-green-600 animate-pulse">
          Please collect your order now
        </p>
      )}
    </div>
  );
}
