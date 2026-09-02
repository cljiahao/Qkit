"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ZoomableImage } from "@/components/zoomable-image";
import { ItemCustomizer } from "@/components/item-customizer";
import { AllergenBadges } from "@/components/allergen-badges";
import { Ticket } from "@/components/ticket";
import { placeOrderSchema, type PlaceOrderInput } from "@/lib/schemas";
import {
  cn,
  count,
  formatOptions,
  formatPrice,
  menuItemActionLabel,
  orderHasPricing,
} from "@/lib/utils";
import { cartKey, cartTotal, sumOptionDeltas } from "@/lib/cart";
import { loadCart, saveCart, clearCart } from "@/lib/cart-storage";
import { addRecentOrder } from "@/lib/recent-orders";
import { reconcileReorder } from "@/lib/reorder";
import { takeReorder } from "@/lib/reorder-handoff";
import { remainingFor, type Remaining } from "@/lib/stock";
import { placeOrder } from "@/app/o/[code]/actions";
import { logEvent } from "@/app/actions/events";
import { groupByCategory } from "@/lib/menu-sections";
import type {
  MenuItem,
  MenuCategory,
  CartItem,
  SelectedOption,
} from "@/lib/types";

interface Props {
  code: string;
  boothId: string;
  menuItems: MenuItem[];
  menuCategories?: MenuCategory[];
  closed?: boolean;
  // Live remaining per capped item (id → count). Absent id = unlimited.
  remaining?: Remaining;
}

export function OrderForm({
  code,
  boothId,
  menuItems,
  menuCategories = [],
  closed = false,
  remaining = {},
}: Props) {
  const router = useRouter();
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [customizing, setCustomizing] = useState<MenuItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hydrated = useRef(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<{ customerName: string; customerPhone?: string }>({
    resolver: zodResolver(
      placeOrderSchema.pick({ customerName: true, customerPhone: true }),
    ),
  });

  // Funnel: a QR landing (this form mounted). Fire-and-forget; paired with the
  // order_placed event to measure scan→order. Coarse — a refresh or back-nav
  // re-counts a view — which is fine for the pilot conversion signal.
  useEffect(() => {
    void logEvent("booth_view", { boothId });
  }, [boothId]);

  // Seed the cart on mount. A "reorder" handoff (explicit intent from the status
  // / recent-orders pages, read-once) wins; otherwise restore an in-progress
  // cart persisted from a prior visit (survives a refresh or mobile tab-eviction
  // — see cart-storage). Either source is reconciled against the LIVE menu +
  // stock here, so prices/availability are always current, never a stale snapshot.
  useEffect(() => {
    const seed = takeReorder(boothId);
    const lines = seed ? seed.lines : loadCart(boothId);
    if (lines.length === 0) return;
    const { items, unavailable } = reconcileReorder(
      lines,
      menuItems,
      remaining,
    );
    if (items.length === 0) {
      // A reorder that can't be fulfilled tells the customer; a persisted cart
      // whose items are all gone is dropped silently (they didn't ask for it).
      if (seed) {
        toast.error("Those items aren't available anymore. Start a new order.");
      } else {
        clearCart(boothId);
      }
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCart(
      new Map(items.map((it) => [cartKey(it.menuItemId, it.options), it])),
    );
    if (seed) {
      if (seed.customerName) setValue("customerName", seed.customerName);
      toast.success(
        unavailable > 0
          ? `Added ${count(items.length, "item")} · ${unavailable} no longer available`
          : `Added ${count(items.length, "item")} to your order`,
      );
    } else if (unavailable > 0) {
      // Restored, but some saved items sold out while the customer was away.
      toast.error(
        `${count(unavailable, "item")} sold out and ${
          unavailable > 1 ? "were" : "was"
        } removed`,
      );
    }
    // boothId is the only real input; menuItems/remaining are stable props and
    // both reads are one-shot, so re-runs are harmless no-ops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boothId]);

  // Persist the cart on every change so a refresh / tab-eviction restores it
  // (the seed effect above reads it back). Skip the first invocation (mount) so
  // an initial empty render can't clobber a saved cart before the restore lands.
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    saveCart(
      boothId,
      Array.from(cart.values(), (it) => ({
        menuItemId: it.menuItemId,
        quantity: it.quantity,
        options: it.options,
      })),
    );
  }, [cart, boothId]);

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
    // Fold selected choices' price_delta_cents into the line's informational
    // price — place_order re-derives the authoritative total the same way
    // from the stored menu, this is display-only. Preserve the "Free" (no
    // price_cents at all) convention when the item is unpriced and nothing
    // selected added a cost either.
    const delta = sumOptionDeltas(item, options);
    const combined = (item.price_cents ?? 0) + delta;
    const price_cents =
      item.price_cents == null && delta === 0 ? undefined : combined;
    updateCart(cartKey(item.id, options), (existing) => ({
      menuItemId: item.id,
      name: item.name,
      price_cents,
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
  const itemCount = cartItems.reduce((n, it) => n + it.quantity, 0);

  async function onSubmit(formData: {
    customerName: string;
    customerPhone?: string;
  }) {
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
      customerPhone: formData.customerPhone,
      items: cartItems,
    };
    // One idempotency key for this submit, generated BEFORE the try so it stays
    // stable across the one retry below — a dropped-then-resent request can't
    // create a second order (place_order replays the prior result for the key).
    const idem = crypto.randomUUID();
    // One retry on a transient network failure (patchy event-site signal) so a
    // dropped request doesn't lose the order. The DB order number is atomic, so
    // a retried submit can't duplicate.
    let result: Awaited<ReturnType<typeof placeOrder>>;
    try {
      result = await placeOrder(code, input, idem);
    } catch {
      try {
        result = await placeOrder(code, input, idem);
      } catch {
        toast.error("Network issue. Please try again.");
        setSubmitting(false);
        return;
      }
    }

    if (!result.success) {
      toast.error(result.error ?? "Order failed");
      setSubmitting(false);
      return;
    }

    // Order placed — the persisted cart has served its purpose; drop it so
    // returning to this booth starts fresh rather than restoring a placed cart.
    clearCart(boothId);

    // Remember on-device so the customer can find this order again after
    // closing the tab (no server-side customer identity exists). The compact
    // items snapshot powers one-tap reorder from the list.
    addRecentOrder({
      boothId,
      orderNumber: result.orderNumber,
      customerName: formData.customerName,
      // The per-order token gates the status page + its polling reads; store it
      // so a "track your recent order" link can reopen the page later.
      token: result.accessToken,
      items: cartItems.map((it) => ({
        menuItemId: it.menuItemId,
        quantity: it.quantity,
        options: it.options,
      })),
    });

    router.push(
      `/order/${result.boothId}/${result.orderNumber}?t=${result.accessToken}`,
    );
  }

  const hasItems = cartItems.length > 0;
  const cartPriced = orderHasPricing(cartItems);
  const sections = groupByCategory(menuItems, menuCategories);
  const grouped = sections.length > 1;

  function renderItemCard(item: MenuItem) {
    const hasOptions = !!item.option_groups && item.option_groups.length > 0;
    // Inline +/- only for plain items (keyed by id). Items with option
    // groups instead go through the sheet, managed in the cart summary.
    const plainInCart = hasOptions ? undefined : cart.get(item.id);
    const left = remainingFor(remaining, item.id);
    const soldOut = left !== null && left <= 0;
    let cardTone: string;
    if (soldOut) cardTone = "border-border opacity-60";
    else if (plainInCart) cardTone = "border-primary/40 bg-primary/[0.04]";
    else cardTone = "border-border";
    const addLabel = menuItemActionLabel(soldOut, hasOptions);
    return (
      <div
        key={item.id}
        className={`flex items-center justify-between gap-4 rounded-xl border bg-card p-3.5 transition-colors ${cardTone}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {item.image_url && (
            <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-border">
              <ZoomableImage
                src={item.image_url}
                alt={item.name}
                sizes="3.5rem"
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
            <AllergenBadges tags={item.allergens ?? []} />
            {left !== null &&
              (soldOut ? (
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-status-cancelled">
                  Sold out
                </p>
              ) : (
                <p
                  className={cn(
                    "mt-1 text-xs font-medium",
                    left <= 5
                      ? "font-semibold text-status-preparing"
                      : "text-muted-foreground",
                  )}
                >
                  {left} left
                </p>
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
                className="size-11 rounded-lg"
                onClick={() => decrement(item.id)}
                aria-label={`Remove one ${item.name}`}
              >
                <Minus className="size-3.5" />
              </Button>
              <span className="w-5 text-center font-mono text-sm font-bold">
                {plainInCart.quantity}
              </span>
              <Button
                type="button"
                size="icon"
                className="size-11 rounded-lg"
                onClick={() => increment(item.id)}
                aria-label={`Add one ${item.name}`}
              >
                <Plus className="size-3.5" />
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 rounded-lg px-4"
              onClick={() => onAddClick(item)}
              disabled={closed || soldOut}
            >
              {addLabel}
            </Button>
          )}
        </div>
      </div>
    );
  }

  let submitLabel: string;
  if (closed) submitLabel = "Booth closed";
  else if (submitting) submitLabel = "Placing order…";
  else if (!hasItems) submitLabel = "Add items to order";
  else if (cartPriced)
    submitLabel = `Place order · ${count(itemCount, "item")} · ${formatPrice(total)}`;
  else submitLabel = `Place order · ${count(itemCount, "item")}`;

  // A booth with no menu yet: show a friendly placeholder instead of an empty
  // list under a bare "Menu" heading with a dead "Add items" bar (reads broken).
  if (menuItems.length === 0) {
    return (
      <Ticket shadow="none" radius="xl" className="px-6 py-12 text-center">
        <p className="font-display text-lg font-semibold">Menu coming soon</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This booth hasn&apos;t added its menu yet. Check back soon.
        </p>
      </Ticket>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Menu items */}
      {grouped ? (
        <>
          <nav className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 text-sm">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#section-${s.id}`}
                className="shrink-0 rounded-full border border-border px-3 py-1.5 font-medium text-muted-foreground"
              >
                {s.label}
              </a>
            ))}
          </nav>
          {sections.map((s) => (
            <section key={s.id} id={`section-${s.id}`}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {s.label}
              </h2>
              <div className="space-y-2.5">{s.items.map(renderItemCard)}</div>
            </section>
          ))}
        </>
      ) : (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Menu
          </h2>
          <div className="space-y-2.5">{menuItems.map(renderItemCard)}</div>
        </section>
      )}

      {/* Cart summary */}
      {hasItems && (
        <Ticket as="section" shadow="none" radius="xl">
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
                      className="size-11 rounded-lg"
                      onClick={() => decrement(key)}
                      aria-label={`Decrease ${item.name}`}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <span className="w-4 text-center font-mono text-sm font-bold">
                      {item.quantity}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      className="size-11 rounded-lg"
                      onClick={() => increment(key)}
                      aria-label={`Increase ${item.name}`}
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
        </Ticket>
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
          aria-invalid={!!errors.customerName}
          aria-describedby={
            errors.customerName ? "customerName-error" : undefined
          }
          {...register("customerName")}
        />
        {errors.customerName && (
          <p
            id="customerName-error"
            className="text-sm font-medium text-destructive"
          >
            {errors.customerName.message}
          </p>
        )}
      </section>

      {/* Customer phone — optional, cross-kit customer identity */}
      <section className="space-y-2.5">
        <Label
          htmlFor="customerPhone"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Phone number (optional)
        </Label>
        <Input
          id="customerPhone"
          type="tel"
          placeholder="So we can recognize you next time"
          className="h-12 rounded-xl text-base"
          aria-invalid={!!errors.customerPhone}
          aria-describedby={
            errors.customerPhone ? "customerPhone-error" : undefined
          }
          {...register("customerPhone")}
        />
        {errors.customerPhone && (
          <p
            id="customerPhone-error"
            className="text-sm font-medium text-destructive"
          >
            {errors.customerPhone.message}
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
            {submitLabel}
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
