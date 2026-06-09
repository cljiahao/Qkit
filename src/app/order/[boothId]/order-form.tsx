"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { placeOrderSchema, type PlaceOrderInput } from "@/lib/schemas";
import { formatPrice, orderHasPricing } from "@/lib/utils";
import { placeOrder } from "./actions";
import { MediaImage } from "@/components/media-image";
import type { MenuItem, CartItem } from "@/lib/types";

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
  const total = cartItems.reduce(
    (sum, i) => sum + (i.price_cents ?? 0) * i.quantity,
    0,
  );

  async function onSubmit(formData: { customerName: string }) {
    if (cartItems.length === 0) {
      toast.error("Add at least one item to your order");
      return;
    }
    setSubmitting(true);

    const input: PlaceOrderInput = {
      customerName: formData.customerName,
      items: cartItems,
    };
    const result = await placeOrder(boothId, input);

    if (!result.success) {
      toast.error(result.error ?? "Order failed");
      setSubmitting(false);
      return;
    }

    router.push(`/order/${boothId}/${result.orderNumber}`);
  }

  const hasItems = cartItems.length > 0;
  const cartPriced = orderHasPricing(cartItems);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Menu items */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Menu
        </h2>
        <div className="space-y-2.5">
          {menuItems.map((item) => {
            const inCart = cart.get(item.id);
            return (
              <div
                key={item.id}
                className={`flex items-center justify-between gap-4 rounded-xl border bg-card p-3.5 transition-colors ${
                  inCart
                    ? "border-primary/40 bg-primary/[0.04]"
                    : "border-border"
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {item.image_url && (
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-border">
                      <MediaImage
                        src={item.image_url}
                        alt=""
                        fill
                        sizes="3.5rem"
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.name}</p>
                    {item.description && (
                      <p className="truncate text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                    {item.price_cents != null && (
                      <p className="mt-1 font-mono text-sm font-semibold text-primary">
                        {formatPrice(item.price_cents)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {inCart ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8 rounded-lg"
                        onClick={() => removeFromCart(item.id)}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <span className="w-5 text-center font-mono text-sm font-bold">
                        {inCart.quantity}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        className="size-8 rounded-lg"
                        onClick={() => addToCart(item)}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => addToCart(item)}
                    >
                      Add
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Cart summary */}
      {hasItems && (
        <section className="ticket overflow-hidden rounded-xl border border-border">
          <h2 className="flex items-center gap-2 px-4 pt-4 pb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <ShoppingCart className="size-3.5" />
            Your order
          </h2>
          <div className="perforation mx-4" />
          <div className="space-y-1.5 px-4 py-3">
            {cartItems.map((item) => (
              <div
                key={item.menuItemId}
                className="flex justify-between gap-2 text-sm"
              >
                <span className="truncate">
                  <span className="font-mono text-muted-foreground">
                    {item.quantity}×
                  </span>{" "}
                  {item.name}
                </span>
                {item.price_cents != null && (
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {formatPrice(item.price_cents * item.quantity)}
                  </span>
                )}
              </div>
            ))}
          </div>
          {cartPriced && (
            <>
              <div className="perforation mx-4" />
              <div className="flex items-baseline justify-between px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Total
                </span>
                <span className="font-mono text-lg font-bold">
                  {formatPrice(total)}
                </span>
              </div>
            </>
          )}
        </section>
      )}

      {/* Customer name */}
      <section className="space-y-2.5">
        <Label
          htmlFor="customerName"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Your name
        </Label>
        <Input
          id="customerName"
          placeholder="So we can call you when it's ready"
          className="h-12 rounded-xl text-base"
          {...register("customerName")}
        />
        {errors.customerName && (
          <p className="text-sm font-medium text-destructive">
            {errors.customerName.message}
          </p>
        )}
      </section>

      {/* Sticky submit bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 px-5 py-3.5 backdrop-blur-md">
        <div className="mx-auto max-w-lg">
          <Button
            type="submit"
            size="lg"
            className="h-14 w-full rounded-xl text-base font-semibold"
            disabled={submitting || !hasItems}
          >
            {submitting
              ? "Placing order…"
              : hasItems
                ? cartPriced
                  ? `Place order · ${formatPrice(total)}`
                  : "Place order"
                : "Add items to order"}
          </Button>
        </div>
      </div>
    </form>
  );
}
