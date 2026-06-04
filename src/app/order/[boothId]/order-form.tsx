'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Minus, Plus, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { placeOrderSchema, type PlaceOrderInput } from '@/lib/schemas';
import { formatPrice } from '@/lib/utils';
import { placeOrder } from './actions';
import type { MenuItem, CartItem } from '@/lib/types';

interface Props {
  boothId: string;
  menuItems: MenuItem[];
}

export function OrderForm({ boothId, menuItems }: Props) {
  const router = useRouter();
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ customerName: string }>({
    resolver: zodResolver(placeOrderSchema.pick({ customerName: true })),
  });

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(item.id);
      next.set(item.id, {
        menuItemId: item.id,
        name: item.name,
        price_cents: item.price_cents,
        quantity: existing ? existing.quantity + 1 : 1,
      });
      return next;
    });
  }

  function removeFromCart(itemId: string) {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(itemId);
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        next.delete(itemId);
      } else {
        next.set(itemId, { ...existing, quantity: existing.quantity - 1 });
      }
      return next;
    });
  }

  const cartItems = Array.from(cart.values());
  const total = cartItems.reduce((sum, i) => sum + i.price_cents * i.quantity, 0);

  async function onSubmit(formData: { customerName: string }) {
    if (cartItems.length === 0) {
      toast.error('Add at least one item to your order');
      return;
    }
    setSubmitting(true);

    const input: PlaceOrderInput = { customerName: formData.customerName, items: cartItems };
    const result = await placeOrder(boothId, input);

    if (!result.success) {
      toast.error(result.error ?? 'Order failed');
      setSubmitting(false);
      return;
    }

    router.push(`/order/${boothId}/${result.orderNumber}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Menu items */}
      <section>
        <h2 className="font-semibold text-lg mb-3">Menu</h2>
        <div className="space-y-2">
          {menuItems.map((item) => {
            const inCart = cart.get(item.id);
            return (
              <Card key={item.id}>
                <CardContent className="p-3 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    {item.description && (
                      <p className="text-sm text-muted-foreground truncate">
                        {item.description}
                      </p>
                    )}
                    <p className="text-sm font-semibold mt-0.5">
                      {formatPrice(item.price_cents)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {inCart ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removeFromCart(item.id)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-4 text-center text-sm font-medium">
                          {inCart.quantity}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => addToCart(item)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addToCart(item)}
                      >
                        Add
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Cart summary */}
      {cartItems.length > 0 && (
        <section>
          <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Your order
          </h2>
          <div className="space-y-1 mb-2">
            {cartItems.map((item) => (
              <div key={item.menuItemId} className="flex justify-between text-sm">
                <span>
                  {item.quantity}× {item.name}
                </span>
                <span>{formatPrice(item.price_cents * item.quantity)}</span>
              </div>
            ))}
          </div>
          <Separator className="my-2" />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
        </section>
      )}

      {/* Customer name + submit */}
      <section className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="customerName">Your name</Label>
          <Input
            id="customerName"
            placeholder="So we can call you when ready"
            {...register('customerName')}
          />
          {errors.customerName && (
            <p className="text-sm text-destructive">{errors.customerName.message}</p>
          )}
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={submitting || cartItems.length === 0}
        >
          {submitting ? 'Placing order…' : `Place order · ${formatPrice(total)}`}
        </Button>
      </section>
    </form>
  );
}
