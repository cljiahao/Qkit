"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ItemCustomizer } from "@/components/item-customizer";
import { cartKey, cartTotal, sumOptionDeltas } from "@/lib/cart";
import { remainingFor, type Remaining } from "@/lib/stock";
import {
  count,
  formatOptions,
  formatPrice,
  orderHasPricing,
} from "@/lib/utils";
import { placeOrderSchema, type PlaceOrderInput } from "@/lib/schemas";
import { getWalkupMenu } from "./walkup-menu-actions";
import { placeWalkupOrder } from "./walkup-actions";
import type { CartItem, MenuItem, SelectedOption } from "@/lib/types";

interface Booth {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Active booths only — the caller (RealtimeOrderBoard) filters is_active
  // before offering this, a paused booth isn't a walk-up target.
  booths: Booth[];
  initialBoothId?: string;
}

/**
 * Staff-entered order for a customer at the counter — same menu/cart/pricing
 * rules as the customer's own ordering flow (place_walkup_order re-derives
 * every price server-side, migration 0060), deliberately NOT the same
 * payment UI: PayPanel is written in the customer's own voice ("waiting for
 * the stall to confirm") and polls for a claim the staff themselves would be
 * making, which reads wrong from this side. Once placed, payment is tracked
 * the same way any order's is — the board's existing OrderCard "Mark as
 * paid"/"Confirm payment" affordance, no new payment surface.
 *
 * Split-pane layout (menu left, order summary right) rather than a single
 * scrolling column — a staff member building a multi-item order needs to see
 * what's already in the cart and hit submit without scrolling past the whole
 * menu first. Panes stack on narrow screens, where there's no room for two
 * columns anyway.
 */
export function WalkupOrderDialog({
  open,
  onOpenChange,
  booths,
  initialBoothId,
}: Props) {
  const [boothId, setBoothId] = useState(initialBoothId ?? booths[0]?.id ?? "");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [remaining, setRemaining] = useState<Remaining>({});
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [customizing, setCustomizing] = useState<MenuItem | null>(null);
  const [customerName, setCustomerName] = useState("Walk-up");
  const [submitting, setSubmitting] = useState(false);

  // Fresh state each time the dialog opens — a leftover cart/booth from the
  // last walk-up order has no business surviving into the next one.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoothId(initialBoothId ?? booths[0]?.id ?? "");
    setCart(new Map());
    setCustomerName("Walk-up");
    // Only the dialog's own open transition should reset — booths/
    // initialBoothId are stable-ish props, not per-keystroke deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !boothId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingMenu(true);
    setCart(new Map());
    void getWalkupMenu(boothId).then((res) => {
      setMenuItems(res?.menuItems ?? []);
      setRemaining(res?.remaining ?? {});
      setLoadingMenu(false);
    });
  }, [open, boothId]);

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

  function qtyInCartFor(menuItemId: string): number {
    let n = 0;
    for (const it of cart.values())
      if (it.menuItemId === menuItemId) n += it.quantity;
    return n;
  }

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
  const hasItems = cartItems.length > 0;
  const cartPriced = orderHasPricing(cartItems);

  async function onSubmit() {
    if (cartItems.length === 0) {
      toast.error("Add at least one item");
      return;
    }
    const input: PlaceOrderInput = {
      customerName: customerName.trim() || "Walk-up",
      items: cartItems,
    };
    const parsed = placeOrderSchema.safeParse(input);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the order details");
      return;
    }
    setSubmitting(true);
    const res = await placeWalkupOrder(boothId, parsed.data);
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success(`Order #${res.orderNumber} added to the board`);
    onOpenChange(false);
  }

  const multiBooth = booths.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl md:h-[640px] md:max-h-[85vh]"
      >
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>New walk-up order</DialogTitle>
          <DialogDescription>
            For a customer ordering at the counter — same menu and pricing as an
            online order.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          {/* Menu pane */}
          <div className="flex-1 space-y-4 p-6 md:overflow-y-auto">
            {multiBooth && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Booth
                </Label>
                <Select value={boothId} onValueChange={setBoothId}>
                  <SelectTrigger className="h-10 w-full rounded-xl sm:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {booths.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {booths.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No open booths to take a walk-up order for — turn one on first.
              </p>
            ) : loadingMenu ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Loading menu…
              </p>
            ) : menuItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                This booth has no menu items yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-2">
                {menuItems.map((item) => {
                  const hasOptions =
                    !!item.option_groups && item.option_groups.length > 0;
                  const plainInCart = hasOptions
                    ? undefined
                    : cart.get(item.id);
                  const left = remainingFor(remaining, item.id);
                  const soldOut = left !== null && left <= 0;
                  return (
                    <div
                      key={item.id}
                      className={`flex flex-col justify-between gap-2 rounded-xl border p-3 transition-colors ${
                        soldOut
                          ? "border-border opacity-60"
                          : plainInCart
                            ? "border-primary/40 bg-primary/[0.04]"
                            : "border-border"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {item.name}
                        </p>
                        {item.price_cents != null && (
                          <p className="font-mono text-xs text-muted-foreground">
                            {formatPrice(item.price_cents)}
                          </p>
                        )}
                        {left !== null && (
                          <p className="text-xs text-muted-foreground">
                            {soldOut ? "Sold out" : `${left} left`}
                          </p>
                        )}
                      </div>
                      {plainInCart ? (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8 rounded-lg"
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
                            className="size-8 rounded-lg"
                            onClick={() => increment(item.id)}
                            aria-label={`Add one ${item.name}`}
                          >
                            <Plus className="size-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-full rounded-lg"
                          onClick={() => onAddClick(item)}
                          disabled={soldOut}
                        >
                          {soldOut
                            ? "Sold out"
                            : hasOptions
                              ? "Customize"
                              : "Add"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Order summary pane — sticky within its own column on md+, so a
              staff member never has to scroll past the whole menu to see
              what's in the order or to hit submit. */}
          <div className="flex flex-col border-t border-border md:w-72 md:shrink-0 md:overflow-y-auto md:border-t-0 md:border-l">
            <div className="flex-1 space-y-4 p-4">
              <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                <ShoppingCart className="size-3.5" />
                Order{hasItems && ` (${count(itemCount, "item")})`}
              </h2>

              {hasItems ? (
                <div className="space-y-3">
                  {cartEntries.map(([key, item]) => {
                    const options = formatOptions(item.options);
                    return (
                      <div
                        key={key}
                        className="flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {item.name}
                          </p>
                          {options && (
                            <p className="truncate text-xs text-muted-foreground">
                              {options}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-7 rounded-lg"
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
                            className="size-7 rounded-lg"
                            onClick={() => increment(key)}
                            aria-label={`Increase ${item.name}`}
                          >
                            <Plus className="size-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {cartPriced && (
                    <div className="flex items-baseline justify-between border-t border-border pt-3">
                      <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                        Total
                      </span>
                      <span className="font-mono text-lg font-bold">
                        {formatPrice(total)}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No items yet — tap items on the left to add them.
                </p>
              )}

              <div className="space-y-1.5">
                <Label
                  htmlFor="walkup-customer-name"
                  className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                >
                  Customer name
                </Label>
                <Input
                  id="walkup-customer-name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="h-10 rounded-xl"
                  maxLength={100}
                />
              </div>
            </div>

            <div className="border-t border-border p-4">
              <Button
                type="button"
                size="lg"
                className="h-12 w-full rounded-xl font-semibold"
                disabled={submitting || !hasItems}
                onClick={onSubmit}
              >
                {submitting
                  ? "Placing order…"
                  : hasItems
                    ? cartPriced
                      ? `Add order · ${count(itemCount, "item")} · ${formatPrice(total)}`
                      : `Add order · ${count(itemCount, "item")}`
                    : "Add items to order"}
              </Button>
            </div>
          </div>
        </div>

        <ItemCustomizer
          item={customizing}
          onClose={() => setCustomizing(null)}
          onAdd={addConfigured}
        />
      </DialogContent>
    </Dialog>
  );
}
