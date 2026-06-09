# Drink Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers customize a drink (single-choice option groups: Style/Temperature/Sugar) in a bottom sheet before adding to cart; collapse the Kopitiam Cart to 3 base drinks (Kopi/Teh/Milo) + options. Options are free.

**Architecture:** `MenuItem` gains optional `option_groups`; cart/order items carry the selected option **labels**. The cart `Map` keys by base id + sorted choices (`lib/cart.ts`), so different combos are separate lines. A bottom `Sheet` (`item-customizer.tsx`) collects choices. Options render as muted sub-lines in the cart, dashboard card, and receipt. Option groups are defined in the seed only (no vendor editor this round).

**Tech Stack:** Next.js 16, TypeScript strict, Zod, Tailwind v4, shadcn `sheet` (Radix Dialog), Vitest.

**Coffee booth id:** `c0ffee01-0000-4000-8000-000000000001` · **Test vendor:** `6df824a1-9da2-4608-ad13-2400a9114ec0` · **DB container:** `supabase_db_qkit`

---

## File Structure

- `src/lib/types.ts` — `OptionChoice`/`OptionGroup`/`SelectedOption`; `option_groups` on `MenuItem`; `options` on `CartItem` + `OrderItem`.
- `src/lib/schemas.ts` — option schemas; wire into `menuItemSchema`, `orderItemSchema`, `placeOrderSchema` item.
- `src/lib/cart.ts` — **new** `cartKey` helper.
- `src/lib/cart.test.ts` — **new** unit tests.
- `src/lib/schemas.test.ts` — option cases.
- `src/components/item-customizer.tsx` — **new** bottom-sheet customizer.
- `src/app/order/[boothId]/order-form.tsx` — sheet integration, key-based cart, option sub-lines.
- `src/components/order-card.tsx` — option sub-lines.
- `src/app/order/[boothId]/[orderNumber]/page.tsx` — option sub-lines.
- `public/seed/{kopi,teh,milo}.svg` — strip milk band; delete `kopi-o/kopi-c/teh-o/teh-c.svg`.
- `supabase/seed/coffee-cart.sql` — 3 base drinks with option_groups.

---

## Phase 1 — Data model, schemas, cart helper

### Task 1: Types + schemas for options

**Files:** Modify `src/lib/types.ts`, `src/lib/schemas.ts`; Test `src/lib/schemas.test.ts`

- [ ] **Step 1: Add the failing schema tests**

Append to `src/lib/schemas.test.ts`:

```ts
describe("menuItemSchema option_groups", () => {
  it("parses an item with option groups", () => {
    const parsed = menuItemSchema.safeParse({
      id: "kopi",
      name: "Kopi",
      available: true,
      option_groups: [
        {
          id: "temp",
          label: "Temperature",
          choices: [
            { id: "hot", label: "Hot" },
            { id: "iced", label: "Iced" },
          ],
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an item with no option groups", () => {
    expect(
      menuItemSchema.safeParse({ id: "x", name: "Water", available: true })
        .success,
    ).toBe(true);
  });
});

describe("placeOrderSchema options", () => {
  it("accepts an order item carrying selected options", () => {
    expect(
      placeOrderSchema.safeParse({
        customerName: "Sam",
        items: [
          {
            menuItemId: "kopi",
            name: "Kopi",
            price_cents: 140,
            quantity: 1,
            options: [
              { group: "Temperature", choice: "Iced" },
              { group: "Sugar", choice: "Less" },
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects a malformed option (empty choice)", () => {
    expect(
      placeOrderSchema.safeParse({
        customerName: "Sam",
        items: [
          {
            menuItemId: "kopi",
            name: "Kopi",
            quantity: 1,
            options: [{ group: "Temperature", choice: "" }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
```

Confirm `menuItemSchema` and `placeOrderSchema` are already imported at the top of the test file (they are).

- [ ] **Step 2: Run tests, confirm red**

Run: `pnpm test -- src/lib/schemas.test.ts`
Expected: FAIL — the "rejects a malformed option" case fails (options not validated yet; unknown key stripped so it passes incorrectly).

- [ ] **Step 3: Add option schemas to `src/lib/schemas.ts`**

Add ABOVE `menuItemFormSchema` (after the `menuImageUrl` block):

```ts
export const optionChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
});

export const optionGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  choices: z.array(optionChoiceSchema),
});

export const selectedOptionSchema = z.object({
  group: z.string().min(1).max(100),
  choice: z.string().min(1).max(100),
});
```

In `placeOrderSchema`, add `options` to the item object (after `quantity`):

```ts
        quantity: z.number().int().min(1).max(20),
        options: z.array(selectedOptionSchema).max(20).optional(),
```

In `menuItemSchema` (the read schema), add after `image_url`:

```ts
  option_groups: z.array(optionGroupSchema).optional(),
```

In `orderItemSchema` (the read schema), add after `price_cents`:

```ts
  options: z.array(selectedOptionSchema).optional(),
```

- [ ] **Step 4: Add types to `src/lib/types.ts`**

Add the option types above `MenuItem`:

```ts
export type OptionChoice = { id: string; label: string };
export type OptionGroup = { id: string; label: string; choices: OptionChoice[] };
export type SelectedOption = { group: string; choice: string };
```

Add `option_groups?: OptionGroup[];` to `MenuItem` (after `image_url`):

```ts
export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price_cents?: number;
  image_url?: string | null;
  option_groups?: OptionGroup[];
  available: boolean;
};
```

Add `options?: SelectedOption[];` to BOTH `CartItem` and `OrderItem` (after `price_cents`):

```ts
export type CartItem = {
  menuItemId: string;
  name: string;
  price_cents?: number;
  options?: SelectedOption[];
  quantity: number;
};

export type OrderItem = {
  menuItemId: string;
  name: string;
  price_cents?: number;
  options?: SelectedOption[];
  quantity: number;
};
```

- [ ] **Step 5: Run tests, confirm green**

Run: `pnpm test -- src/lib/schemas.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/schemas.ts src/lib/schemas.test.ts
git commit -m "feat(menu): option_groups + selected options on items (types + schema)"
```

---

### Task 2: `cartKey` helper (TDD)

**Files:** Create `src/lib/cart.ts`, `src/lib/cart.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/cart.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cartKey } from "./cart";

describe("cartKey", () => {
  it("returns the bare id when there are no options", () => {
    expect(cartKey("kopi")).toBe("kopi");
    expect(cartKey("kopi", [])).toBe("kopi");
  });

  it("is stable regardless of option order", () => {
    const a = cartKey("kopi", [
      { group: "Temperature", choice: "Iced" },
      { group: "Sugar", choice: "Less" },
    ]);
    const b = cartKey("kopi", [
      { group: "Sugar", choice: "Less" },
      { group: "Temperature", choice: "Iced" },
    ]);
    expect(a).toBe(b);
  });

  it("differs when a choice differs", () => {
    const hot = cartKey("kopi", [{ group: "Temperature", choice: "Hot" }]);
    const iced = cartKey("kopi", [{ group: "Temperature", choice: "Iced" }]);
    expect(hot).not.toBe(iced);
  });

  it("differs by base id", () => {
    expect(cartKey("kopi")).not.toBe(cartKey("teh"));
  });
});
```

- [ ] **Step 2: Run test, confirm red**

Run: `pnpm test -- src/lib/cart.test.ts`
Expected: FAIL — `cartKey` not defined.

- [ ] **Step 3: Implement `src/lib/cart.ts`**

```ts
import type { SelectedOption } from "@/lib/types";

// US = ASCII unit separator (0x1F); cannot appear in user-facing labels, so two
// different combos can never collide even when a label contains spaces.
const US = String.fromCharCode(31);

/**
 * Stable cart key: base id plus each selected choice, sorted by group so
 * selection order doesn't matter. No options => the bare id (back-compat with
 * plain, non-customizable items).
 */
export function cartKey(
  menuItemId: string,
  options?: SelectedOption[],
): string {
  if (!options || options.length === 0) return menuItemId;
  const parts = [...options]
    .sort((a, b) => a.group.localeCompare(b.group))
    .map((o) => `${o.group}${US}${o.choice}`);
  return [menuItemId, ...parts].join(US);
}
```

- [ ] **Step 4: Run test, confirm green**

Run: `pnpm test -- src/lib/cart.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cart.ts src/lib/cart.test.ts
git commit -m "feat(cart): cartKey helper for option-aware cart lines"
```

---

## Phase 2 — Customer UI

### Task 3: Bottom-sheet customizer

**Files:** Create `src/components/item-customizer.tsx`

- [ ] **Step 1: Create the component**

`src/components/item-customizer.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { MenuItem, SelectedOption } from "@/lib/types";

interface Props {
  item: MenuItem | null;
  onClose: () => void;
  onAdd: (item: MenuItem, options: SelectedOption[]) => void;
}

export function ItemCustomizer({ item, onClose, onAdd }: Props) {
  // selected: group id -> choice id
  const [selected, setSelected] = useState<Record<string, string>>({});

  // Reset to defaults (first choice per group) whenever a new item opens.
  useEffect(() => {
    if (!item) return;
    const defaults: Record<string, string> = {};
    for (const g of item.option_groups ?? []) {
      if (g.choices[0]) defaults[g.id] = g.choices[0].id;
    }
    setSelected(defaults);
  }, [item]);

  if (!item) return null;
  const groups = item.option_groups ?? [];

  function confirm() {
    if (!item) return;
    const options: SelectedOption[] = groups.map((g) => {
      const choice =
        g.choices.find((c) => c.id === selected[g.id]) ?? g.choices[0];
      return { group: g.label, choice: choice.label };
    });
    onAdd(item, options);
    onClose();
  }

  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85vh] max-w-lg overflow-y-auto rounded-t-2xl"
      >
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">{item.name}</SheetTitle>
          {item.description && (
            <SheetDescription>{item.description}</SheetDescription>
          )}
        </SheetHeader>

        <div className="space-y-5 px-4">
          {groups.map((g) => (
            <div key={g.id} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {g.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {g.choices.map((c) => {
                  const active = selected[g.id] === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setSelected((s) => ({ ...s, [g.id]: c.id }))
                      }
                      className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-foreground hover:border-primary/40"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <SheetFooter>
          <Button
            type="button"
            size="lg"
            className="h-12 w-full rounded-xl text-base font-semibold"
            onClick={confirm}
          >
            Add to order
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/item-customizer.tsx
git commit -m "feat(order): bottom-sheet drink customizer"
```

---

### Task 4: Wire the customizer + key-based cart into the order form

**Files:** Modify `src/app/order/[boothId]/order-form.tsx`

This task replaces the whole file. The cart `Map` now keys by `cartKey`; items with `option_groups` open the sheet; the cart summary gains per-line +/- controls and an options sub-line.

- [ ] **Step 1: Replace `src/app/order/[boothId]/order-form.tsx` with:**

```tsx
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
import { formatPrice, orderHasPricing } from "@/lib/utils";
import { cartKey } from "@/lib/cart";
import { placeOrder } from "./actions";
import type { MenuItem, CartItem, SelectedOption } from "@/lib/types";

interface Props {
  boothId: string;
  menuItems: MenuItem[];
}

function optionsLabel(options?: SelectedOption[]): string {
  return options && options.length
    ? options.map((o) => o.choice).join(" · ")
    : "";
}

export function OrderForm({ boothId, menuItems }: Props) {
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

  function addConfigured(item: MenuItem, options: SelectedOption[]) {
    const key = cartKey(item.id, options);
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      next.set(key, {
        menuItemId: item.id,
        name: item.name,
        price_cents: item.price_cents,
        options: options.length ? options : undefined,
        quantity: existing ? existing.quantity + 1 : 1,
      });
      return next;
    });
  }

  function increment(key: string) {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      if (!existing) return prev;
      next.set(key, { ...existing, quantity: existing.quantity + 1 });
      return next;
    });
  }

  function decrement(key: string) {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      if (!existing) return prev;
      if (existing.quantity <= 1) next.delete(key);
      else next.set(key, { ...existing, quantity: existing.quantity - 1 });
      return next;
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
            const hasOptions =
              !!item.option_groups && item.option_groups.length > 0;
            // Inline +/- only for plain items (keyed by id). Option items are
            // added via the sheet and managed in the cart summary.
            const plainInCart = hasOptions ? undefined : cart.get(item.id);
            return (
              <div
                key={item.id}
                className={`flex items-center justify-between gap-4 rounded-xl border bg-card p-3.5 transition-colors ${
                  plainInCart
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
                    >
                      {hasOptions ? "Customize" : "Add"}
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
            {cartEntries.map(([key, item]) => (
              <div key={key} className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  {optionsLabel(item.options) && (
                    <p className="truncate text-xs text-muted-foreground">
                      {optionsLabel(item.options)}
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

      <ItemCustomizer
        item={customizing}
        onClose={() => setCustomizing(null)}
        onAdd={addConfigured}
      />
    </form>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/order/[boothId]/order-form.tsx"
git commit -m "feat(order): customize drinks via sheet; option-aware cart lines"
```

---

## Phase 3 — Vendor + receipt display

### Task 5: Option sub-lines on order card + receipt

**Files:** Modify `src/components/order-card.tsx`, `src/app/order/[boothId]/[orderNumber]/page.tsx`

- [ ] **Step 1: Order card — sub-line under each item**

In `src/components/order-card.tsx`, replace the items map block:

```tsx
        {items.map((item, i) => (
          <div key={i} className="flex justify-between gap-2 text-sm">
            <span className="truncate">
              <span className="font-mono text-muted-foreground">
                {item.quantity}×
              </span>{" "}
              {item.name}
            </span>
            {priced && (
              <span className="shrink-0 font-mono text-muted-foreground">
                {formatPrice((item.price_cents ?? 0) * item.quantity)}
              </span>
            )}
          </div>
        ))}
```

with:

```tsx
        {items.map((item, i) => (
          <div key={i} className="text-sm">
            <div className="flex justify-between gap-2">
              <span className="truncate">
                <span className="font-mono text-muted-foreground">
                  {item.quantity}×
                </span>{" "}
                {item.name}
              </span>
              {priced && (
                <span className="shrink-0 font-mono text-muted-foreground">
                  {formatPrice((item.price_cents ?? 0) * item.quantity)}
                </span>
              )}
            </div>
            {item.options && item.options.length > 0 && (
              <p className="pl-5 text-xs text-muted-foreground">
                {item.options.map((o) => o.choice).join(" · ")}
              </p>
            )}
          </div>
        ))}
```

- [ ] **Step 2: Receipt — sub-line under each item**

In `src/app/order/[boothId]/[orderNumber]/page.tsx`, replace the items map block:

```tsx
          {items.map((item, i) => (
            <div key={i} className="flex justify-between gap-2 text-sm">
              <span className="truncate">
                <span className="font-mono text-muted-foreground">
                  {item.quantity}×
                </span>{" "}
                {item.name}
              </span>
              {priced && (
                <span className="shrink-0 font-mono text-muted-foreground">
                  {formatPrice((item.price_cents ?? 0) * item.quantity)}
                </span>
              )}
            </div>
          ))}
```

with:

```tsx
          {items.map((item, i) => (
            <div key={i} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate">
                  <span className="font-mono text-muted-foreground">
                    {item.quantity}×
                  </span>{" "}
                  {item.name}
                </span>
                {priced && (
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {formatPrice((item.price_cents ?? 0) * item.quantity)}
                  </span>
                )}
              </div>
              {item.options && item.options.length > 0 && (
                <p className="pl-5 text-xs text-muted-foreground">
                  {item.options.map((o) => o.choice).join(" · ")}
                </p>
              )}
            </div>
          ))}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/order-card.tsx "src/app/order/[boothId]/[orderNumber]/page.tsx"
git commit -m "feat(orders): show selected options on card + receipt"
```

---

## Phase 4 — Art + seed

### Task 6: Neutralize cup art; delete unused variants

**Files:** Modify `public/seed/{kopi,teh,milo}.svg`; Delete `public/seed/{kopi-o,kopi-c,teh-o,teh-c}.svg`

- [ ] **Step 1: Replace `public/seed/kopi.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 200" role="img" aria-label="Kopi">
  <rect width="160" height="200" fill="#faf3e6"/>
  <ellipse cx="80" cy="170" rx="54" ry="9" fill="#e3d4b8"/>
  <path d="M44 70 h72 l-7 86 a9 9 0 0 1 -9 8 H60 a9 9 0 0 1 -9 -8 Z" fill="#ffffff" stroke="#8a6d4f" stroke-width="3"/>
  <path d="M49 96 h62 l-5 60 a9 9 0 0 1 -9 8 H63 a9 9 0 0 1 -9 -8 Z" fill="#3a2419"/>
  <text x="80" y="190" text-anchor="middle" font-family="monospace" font-size="15" font-weight="700" fill="#3a2419">KOPI</text>
</svg>
```

- [ ] **Step 2: Replace `public/seed/teh.svg`** (liquid `#c06a1f`, label TEH)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 200" role="img" aria-label="Teh">
  <rect width="160" height="200" fill="#faf3e6"/>
  <ellipse cx="80" cy="170" rx="54" ry="9" fill="#e3d4b8"/>
  <path d="M44 70 h72 l-7 86 a9 9 0 0 1 -9 8 H60 a9 9 0 0 1 -9 -8 Z" fill="#ffffff" stroke="#8a6d4f" stroke-width="3"/>
  <path d="M49 96 h62 l-5 60 a9 9 0 0 1 -9 8 H63 a9 9 0 0 1 -9 -8 Z" fill="#c06a1f"/>
  <text x="80" y="190" text-anchor="middle" font-family="monospace" font-size="15" font-weight="700" fill="#3a2419">TEH</text>
</svg>
```

- [ ] **Step 3: Replace `public/seed/milo.svg`** (liquid `#5a3a1a`, label MILO)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 200" role="img" aria-label="Milo">
  <rect width="160" height="200" fill="#faf3e6"/>
  <ellipse cx="80" cy="170" rx="54" ry="9" fill="#e3d4b8"/>
  <path d="M44 70 h72 l-7 86 a9 9 0 0 1 -9 8 H60 a9 9 0 0 1 -9 -8 Z" fill="#ffffff" stroke="#8a6d4f" stroke-width="3"/>
  <path d="M49 96 h62 l-5 60 a9 9 0 0 1 -9 8 H63 a9 9 0 0 1 -9 -8 Z" fill="#5a3a1a"/>
  <text x="80" y="190" text-anchor="middle" font-family="monospace" font-size="15" font-weight="700" fill="#3a2419">MILO</text>
</svg>
```

- [ ] **Step 4: Delete the unused variant SVGs**

```bash
git rm public/seed/kopi-o.svg public/seed/kopi-c.svg public/seed/teh-o.svg public/seed/teh-c.svg
```

- [ ] **Step 5: Commit**

```bash
git add public/seed
git commit -m "feat(seed): style-agnostic base cups; drop variant art"
```

---

### Task 7: Rewrite the coffee seed with option groups

**Files:** Modify `supabase/seed/coffee-cart.sql`; apply to local DB

- [ ] **Step 1: Replace `supabase/seed/coffee-cart.sql`**

```sql
-- Kopitiam Cart: 3 base drinks under the existing "Test" vendor, each with
-- single-choice option groups. vendors.id is FK to auth.users.id, so we reuse
-- the real Test vendor. Run manually (Step 2); never via `db reset`.
insert into public.booths (id, vendor_id, name, is_active, image_url, menu_items)
values (
  'c0ffee01-0000-4000-8000-000000000001',
  '6df824a1-9da2-4608-ad13-2400a9114ec0',
  'Kopitiam Cart',
  true,
  '/seed/kopitiam-chart.svg',
  '[
    {
      "id":"kopi","name":"Kopi","description":"Local coffee","price_cents":140,
      "image_url":"/seed/kopi.svg","available":true,
      "option_groups":[
        {"id":"style","label":"Style","choices":[
          {"id":"o","label":"O (black)"},
          {"id":"c","label":"C (evaporated milk)"},
          {"id":"normal","label":"Normal (condensed milk)"}
        ]},
        {"id":"temp","label":"Temperature","choices":[
          {"id":"hot","label":"Hot"},
          {"id":"iced","label":"Iced"}
        ]},
        {"id":"sugar","label":"Sugar","choices":[
          {"id":"normal","label":"Normal"},
          {"id":"less","label":"Less"},
          {"id":"none","label":"None"}
        ]}
      ]
    },
    {
      "id":"teh","name":"Teh","description":"Local tea","price_cents":140,
      "image_url":"/seed/teh.svg","available":true,
      "option_groups":[
        {"id":"style","label":"Style","choices":[
          {"id":"o","label":"O (no milk)"},
          {"id":"c","label":"C (evaporated milk)"},
          {"id":"normal","label":"Normal (condensed milk)"}
        ]},
        {"id":"temp","label":"Temperature","choices":[
          {"id":"hot","label":"Hot"},
          {"id":"iced","label":"Iced"}
        ]},
        {"id":"sugar","label":"Sugar","choices":[
          {"id":"normal","label":"Normal"},
          {"id":"less","label":"Less"},
          {"id":"none","label":"None"}
        ]}
      ]
    },
    {
      "id":"milo","name":"Milo","description":"Malt chocolate","price_cents":200,
      "image_url":"/seed/milo.svg","available":true,
      "option_groups":[
        {"id":"temp","label":"Temperature","choices":[
          {"id":"hot","label":"Hot"},
          {"id":"iced","label":"Iced"}
        ]},
        {"id":"sugar","label":"Sugar","choices":[
          {"id":"normal","label":"Normal"},
          {"id":"less","label":"Less"},
          {"id":"none","label":"None"}
        ]}
      ]
    }
  ]'::jsonb
)
on conflict (id) do update
  set name = excluded.name,
      is_active = excluded.is_active,
      image_url = excluded.image_url,
      menu_items = excluded.menu_items;
```

- [ ] **Step 2: Apply to the local DB**

```powershell
Get-Content supabase/seed/coffee-cart.sql -Raw | docker exec -i supabase_db_qkit psql -U postgres -d postgres
```

Expected: `INSERT 0 1` or `UPDATE 1`.

- [ ] **Step 3: Verify**

```powershell
docker exec -i supabase_db_qkit psql -U postgres -d postgres -c "select jsonb_array_length(menu_items) as items, menu_items->0->>'name' as first from public.booths where id='c0ffee01-0000-4000-8000-000000000001';"
```

Expected: `items = 3`, `first = Kopi`.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed/coffee-cart.sql
git commit -m "feat(seed): 3 base drinks with option groups"
```

---

## Phase 5 — Verification

### Task 8: Full gate

- [ ] **Step 1: check + test + build**

```bash
pnpm check
pnpm test
pnpm build
```

Expected: `pnpm check` clean; `pnpm test` all green (incl. new cart + schema cases); `pnpm build` succeeds.

- [ ] **Step 2: Fix any failures at the root cause** (run `pnpm format` for prettier; never weaken types or skip tests). Re-run until green.

- [ ] **Step 3: Commit if Step 2 changed files**

```bash
git add -A
git commit -m "chore: format + verification fixes for drink customization"
```

---

## Self-Review notes (author)

- **Spec coverage:** A model → Task 1; B schemas → Task 1; C cart key → Task 2; D customer flow → Tasks 3,4; E display → Tasks 4 (cart) + 5 (card/receipt); F seed → Task 7; G art → Task 6; H testing → Tasks 1,2 + gate 8. ✓
- **Back-compat:** `cartKey` with no options = bare id; plain items keep inline +/-; Test Stall (no option_groups) unaffected. ✓
- **Type consistency:** `SelectedOption {group,choice}` used in types, schemas, cart, customizer, order-form, display. `option_groups?: OptionGroup[]` on MenuItem; `options?: SelectedOption[]` on CartItem/OrderItem; PlaceOrderInput item `options?` matches CartItem. ✓
- **Sheet a11y:** `SheetTitle` always rendered (Radix Dialog requires it). Customizer buttons `type="button"`; Sheet portals out of the `<form>` so "Add to order" can't submit. ✓
- **No placeholders:** all SVGs, SQL, and components are complete. ✓
