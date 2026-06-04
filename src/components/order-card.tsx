'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { OrderStatusBadge } from './order-status-badge';
import { createClient } from '@/lib/supabase/client';
import { formatPrice } from '@/lib/utils';
import type { Order, OrderItem, OrderStatus } from '@/lib/types';

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending:   'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
  ready:     'completed',
};

export function OrderCard({ order }: { order: Order }) {
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [updating, setUpdating] = useState(false);
  const supabase = createClient();
  const items = order.items as OrderItem[];
  const nextStatus = NEXT_STATUS[status];

  async function advanceStatus() {
    if (!nextStatus) return;
    setUpdating(true);
    const { error } = await supabase
      .from('orders')
      .update({ status: nextStatus })
      .eq('id', order.id);

    if (error) {
      toast.error('Failed to update order: ' + error.message);
    } else {
      setStatus(nextStatus);
    }
    setUpdating(false);
  }

  async function cancelOrder() {
    setUpdating(true);
    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', order.id);

    if (error) {
      toast.error('Failed to cancel order');
    } else {
      setStatus('cancelled');
    }
    setUpdating(false);
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono font-bold text-lg">#{order.order_number}</p>
            <p className="text-sm text-muted-foreground">{order.customer_name}</p>
          </div>
          <OrderStatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span>
                {item.quantity}× {item.name}
              </span>
              <span className="text-muted-foreground">
                {formatPrice(item.price_cents * item.quantity)}
              </span>
            </div>
          ))}
        </div>
        <Separator />
        <div className="flex justify-between font-medium">
          <span>Total</span>
          <span>{formatPrice(order.total_cents)}</span>
        </div>
        {status !== 'completed' && status !== 'cancelled' && (
          <div className="flex gap-2 pt-1">
            {nextStatus && (
              <Button
                size="sm"
                className="flex-1"
                onClick={advanceStatus}
                disabled={updating}
              >
                Mark {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={cancelOrder}
              disabled={updating}
            >
              Cancel
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {new Date(order.created_at).toLocaleTimeString()}
        </p>
      </CardContent>
    </Card>
  );
}
