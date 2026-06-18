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
import { MediaImage } from "@/components/media-image";
import { ItemCustomizer } from "@/components/item-customizer";
import { placeOrderSchema, type PlaceOrderInput } from "@/lib/schemas";
import { formatOptions, formatPrice, orderHasPricing } from "@/lib/utils";
import { cartKey, cartTotal } from "@/lib/cart";
import { addRecentOrder } from "@/lib/recent-orders";
import { remainingFor, type Remaining } from "@/lib/stock";
import { placeOrder } from "./actions";
import type { MenuItem, CartItem, SelectedOption } from "@/lib/types";

interface Props {
  boothId: string;
  menuItems: MenuItem[];
  closed?: boolean;
  // Live remaining per capped item (id → count). Absent id = unlimited.
  remaining?: Remaining;
}

export function OrderForm({
  boothId,
  menuItems,
  closed = false,
  remaining = {},
}: Props) {
  const router = useRouter();
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [customizing, setCustomizing] = useState<MenuItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ customerName: string }>({
    resolver: zodResolver(placeOrderSchema.pick({ customerName: true })),
  });

  // Single cart mutator. The updater receives the current entry (or undefined)
  // and returns: a CartItem to set, null to remove, or undefined to no-op
  // (keeps the same Map ref, so no needless re-render).
  function updateCart(
    key: string,
    fn: (existing: CartItem | undefined) => CartItem | null | undefined,
  ) {
    setCart((prev) => {
      const result = fn(prev.get(key));
      if (result === undefined) return prev;
      const next = new Map(prev);
      if (result === null) next.delete(key);
      else next.set(key, result);
      return next;
    });
  }

  // Stock is per menu item, pooled across its option variants. Sum the current
  // cart quantity for an item so a capped item can't be over-added.
  function qtyInCartFor(menuItemId: string): number {
    let n = 0;
    for (const it of cart.values()) {
      if (it.menuItemId === menuItemId) n += it.quantity;
    }
    return n;
  }

  /** Block (and explain) when adding one more would exceed the live cap. */
  function blockedByStock(menuItemId: string): boolean {
    const left = remainingFor(remaining, menuItemId);
    if (left === null) return false;
    if (qtyInCartFor(menuItemId) >= left) {
      toast.error(left <= 0 ? "Sold out" : `Only ${left} left`);
      return true;
    }
    return false;
  }

  function addConfigured(item: MenuItem, options: SelectedOption[]) {
    if (blockedByStock(item.id)) return;
    updateCart(cartKey(item.id, options), (existing) => ({
      menuItemId: item.id,
      name: item.name,
      price_cents: item.price_cents,
      options: options.length ? options : undefined,
      quantity: existing ? existing.quantity + 1 : 1,
    }));
  }

  function increment(key: string) {
    const entry = cart.get(key);
    if (entry && blockedByStock(entry.menuItemId)) return;
    updateCart(key, (existing) =>
      existing ? { ...existing, quantity: existing.quantity + 1 } : undefined,
    );
  }

  function decrement(key: string) {
    updateCart(key, (existing) => {
      if (!existing) return undefined;
      return existing.quantity <= 1
        ? null
        : { ...existing, quantity: existing.quantity - 1 };
    });
  }

  function onAddClick(item: MenuItem) {
    if (item.option_groups && item.option_groups.length > 0) {
      setCustomizing(item);
    } else {
      addConfigured(item, []);
    }
  }

  const cartEntries = Array.from(cart.entries());
  const cartItems = Array.from(cart.values());
  const total = cartTotal(cartItems);

  async function onSubmit(formData: { customerName: string }) {
    if (closed) {
      toast.error("This booth is closed right now");
      return;
    }
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

    // Remember on-device so the customer can find this order again after
    // closing the tab (no server-side customer identity exists).
    addRecentOrder({
      boothId,
      orderNumber: result.orderNumber,
      customerName: formData.customerName,
    });

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
            const hasOptions =
              !!item.option_groups && item.option_groups.length > 0;
            // Inline +/- only for plain items (keyed by id). Option items are
            // added via the sheet and managed in the cart summary.
            const plainInCart = hasOptions ? undefined : cart.get(item.id);
            const left = remainingFor(remaining, item.id);
            const soldOut = left !== null && left <= 0;
            return (
              <div
                key={item.id}
                className={`flex items-center justify-between gap-4 rounded-xl border bg-card p-3.5 transition-colors ${
                  soldOut
                    ? "border-border opacity-60"
                    : plainInCart
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
                    {left !== null &&
                      (soldOut ? (
                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-status-cancelled">
                          Sold out
                        </p>
                      ) : (
                        left <= 5 && (
                          <p className="mt-1 text-xs font-medium text-muted-foreground">
                            {left} left
                          </p>
                        )
                      ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {plainInCart ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8 rounded-lg"
                        onClick={() => decrement(item.id)}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <span className="w-5 text-center font-mono text-sm font-bold">
                        {plainInCart.quantity}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        className="size-8 rounded-lg"
                        onClick={() => increment(item.id)}
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
                      onClick={() => onAddClick(item)}
                      disabled={closed || soldOut}
                    >
                      {soldOut ? "Sold out" : hasOptions ? "Customize" : "Add"}
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
          <div className="space-y-3 px-4 py-3">
            {cartEntries.map(([key, item]) => {
              const options = formatOptions(item.options);
              return (
                <div
                  key={key}
                  className="flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    {options && (
                      <p className="truncate text-xs text-muted-foreground">
                        {options}
                      </p>
                    )}
                    {item.price_cents != null && (
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {formatPrice(item.price_cents * item.quantity)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-7 rounded-lg"
                      onClick={() => decrement(key)}
                      aria-label="Remove one"
                    >
                      <Minus className="size-3" />
                    </Button>
                    <span className="w-4 text-center font-mono text-sm font-bold">
                      {item.quantity}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      className="size-7 rounded-lg"
                      onClick={() => increment(key)}
                      aria-label="Add one"
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
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
            disabled={submitting || !hasItems || closed}
          >
            {closed
              ? "Booth closed"
              : submitting
                ? "Placing order…"
                : hasItems
                  ? cartPriced
                    ? `Place order · ${formatPrice(total)}`
                    : "Place order"
                  : "Add items to order"}
          </Button>
        </div>
      </div>

      <ItemCustomizer
        item={customizing}
        onClose={() => setCustomizing(null)}
        onAdd={addConfigured}
      />
    </form>
  );
}
