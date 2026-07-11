# Booth & Menu Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give vendors an in-app UI to create/edit their booths (name, banner image, active toggle, menu editor with optional per-item prices), persisted to Supabase, and make the customer/order surfaces hide money when items are unpriced.

**Architecture:** New pages under the existing auth-guarded `/dashboard`. A single `saveBooth` server action (insert-or-update, RLS-scoped) is the sole writer. A reusable client `ImageUploader` uploads to a public-read Supabase Storage bucket under a per-vendor path. Pricing becomes optional in Zod + types; a single `orderHasPricing()` helper decides whether any money is shown.

**Tech Stack:** Next.js 16 (App Router), `@supabase/ssr` + Supabase Storage, TypeScript strict, Zod, React Hook Form not used here (controlled state for the dynamic menu editor), shadcn/ui, Vitest.

---

## File Structure

- Create: `supabase/migrations/0002_booth_images_and_storage.sql` — `booths.image_url` + `booth-images` bucket + storage RLS.
- Modify: `src/lib/types.ts` — `booths.image_url`; optional `price_cents` on `MenuItem`/`CartItem`/`OrderItem`.
- Modify: `src/lib/schemas.ts` — optional `price_cents`; add `menuItemFormSchema`, `boothFormSchema` + types.
- Modify: `src/lib/schemas.test.ts` — schema unit tests.
- Modify: `src/lib/utils.ts` — `orderHasPricing()`.
- Modify: `src/lib/utils.test.ts` — `orderHasPricing` tests.
- Modify: `src/app/order/[boothId]/actions.ts` — optional-price total.
- Create: `src/components/image-uploader.tsx` — reusable uploader.
- Create: `src/app/dashboard/booths/menu-editor.tsx` — dynamic menu rows.
- Create: `src/app/dashboard/booths/booth-form.tsx` — booth form (name, image, active, menu).
- Create: `src/app/dashboard/booths/actions.ts` — `saveBooth`.
- Create: `src/app/dashboard/booths/page.tsx` — booth list.
- Create: `src/app/dashboard/booths/booth-list.tsx` — client list row (copy link).
- Create: `src/app/dashboard/booths/new/page.tsx` — create.
- Create: `src/app/dashboard/booths/[boothId]/page.tsx` — edit.
- Modify: `src/app/dashboard/layout.tsx` — "Booths" nav link.
- Modify: `src/app/order/[boothId]/page.tsx` — banner.
- Modify: `src/app/order/[boothId]/order-form.tsx` — optional-price menu/cart/submit.
- Modify: `src/app/order/[boothId]/[orderNumber]/page.tsx` — hide money when unpriced.
- Modify: `src/components/order-card.tsx` — hide money when unpriced.

**Testing note:** Only Zod schemas and `orderHasPricing` are cleanly unit-testable. Supabase-touching units (`saveBooth`, `ImageUploader`, pages) follow the existing repo policy — no mock infra (YAGNI); verified by `pnpm build` + the manual flow in Task 12.

---

### Task 1: Migration — `booths.image_url` + Storage bucket + RLS

**Files:**

- Create: `supabase/migrations/0002_booth_images_and_storage.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0002_booth_images_and_storage.sql`:

```sql
-- Booth banner image
ALTER TABLE public.booths ADD COLUMN image_url TEXT;

-- Public-read bucket for booth banners
INSERT INTO storage.buckets (id, name, public)
VALUES ('booth-images', 'booth-images', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone may read banner images (customer ordering pages)
CREATE POLICY "booth_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'booth-images');

-- A vendor may write only under their own "{auth.uid()}/..." path
CREATE POLICY "booth_images_vendor_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'booth-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "booth_images_vendor_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'booth-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "booth_images_vendor_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'booth-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Apply to the running local stack (does not wipe data)**

Run: `pnpm supabase migration up`
Expected: `Applying migration 0002_booth_images_and_storage.sql...` then success. (If it reports nothing pending, the stack already has it.)

- [ ] **Step 3: Verify the column + bucket exist**

Run:

```bash
docker exec $(docker ps --filter name=supabase_db --format "{{.Names}}") \
  psql -U postgres -d postgres -c \
  "select column_name from information_schema.columns where table_schema='public' and table_name='booths' and column_name='image_url'; select id, public from storage.buckets where id='booth-images';"
```

Expected: one row `image_url`; one row `booth-images | t`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_booth_images_and_storage.sql
git commit -m "feat(db): add booth image_url and booth-images storage bucket"
```

---

### Task 2: Types — image_url + optional prices

**Files:**

- Modify: `src/lib/types.ts`

No unit test (type-only; verified by `pnpm exec tsc --noEmit`).

- [ ] **Step 1: Make `price_cents` optional on the three item types**

In `src/lib/types.ts`, change `MenuItem`, `CartItem`, and `OrderItem` so `price_cents` is optional:

```ts
export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price_cents?: number;
  available: boolean;
};

export type CartItem = {
  menuItemId: string;
  name: string;
  price_cents?: number;
  quantity: number;
};

export type OrderItem = {
  menuItemId: string;
  name: string;
  price_cents?: number;
  quantity: number;
};
```

- [ ] **Step 2: Add `image_url` to the `booths` Row/Insert/Update**

In the `booths` table type, add `image_url` to each:

```ts
        Row: {
          id: string;
          vendor_id: string;
          name: string;
          menu_items: Json;
          is_active: boolean;
          image_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          name: string;
          menu_items?: Json;
          is_active?: boolean;
          image_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          name?: string;
          menu_items?: Json;
          is_active?: boolean;
          image_url?: string | null;
          created_at?: string;
        };
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: errors ONLY where required-price arithmetic now sees `number | undefined` (e.g. `order-form.tsx`, `order/[boothId]/actions.ts`, `order-card.tsx`). These are fixed in Tasks 4 and 11. If errors appear elsewhere, stop and reassess.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): optional menu/cart/order price, booth image_url"
```

---

### Task 3: `orderHasPricing` helper

**Files:**

- Modify: `src/lib/utils.ts`
- Test: `src/lib/utils.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/utils.test.ts` (and add `orderHasPricing` to the import on line 2):

```ts
describe("orderHasPricing", () => {
  it("is true when any item has a price", () => {
    expect(
      orderHasPricing([{ price_cents: undefined }, { price_cents: 500 }]),
    ).toBe(true);
  });

  it("is false when no item has a price", () => {
    expect(orderHasPricing([{ price_cents: undefined }, {}])).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(orderHasPricing([])).toBe(false);
  });

  it("treats price_cents 0 as priced", () => {
    expect(orderHasPricing([{ price_cents: 0 }])).toBe(true);
  });
});
```

Update the import line:

```ts
import { cn, formatPrice, genOrderNumber, orderHasPricing } from "./utils";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/utils.test.ts`
Expected: FAIL — `orderHasPricing` is not exported.

- [ ] **Step 3: Implement in `src/lib/utils.ts`**

Append:

```ts
/** True when at least one item carries a price (drives whether money is shown). */
export function orderHasPricing(
  items: { price_cents?: number | null }[],
): boolean {
  return items.some((i) => i.price_cents != null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/utils.test.ts`
Expected: PASS (8 existing + 4 new = 12).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils.ts src/lib/utils.test.ts
git commit -m "feat(utils): add orderHasPricing helper"
```

---

### Task 4: Schemas — optional price, booth form schema

**Files:**

- Modify: `src/lib/schemas.ts`
- Test: `src/lib/schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/schemas.test.ts` (and extend the import on line 2):

```ts
import { vendorSchema, menuItemSchema, boothFormSchema } from "./schemas";

describe("menuItemSchema", () => {
  it("accepts an item with no price", () => {
    expect(
      menuItemSchema.safeParse({
        id: "1",
        name: "Free water",
        available: true,
      }).success,
    ).toBe(true);
  });

  it("accepts an item with a price", () => {
    expect(
      menuItemSchema.safeParse({
        id: "1",
        name: "Laksa",
        price_cents: 600,
        available: true,
      }).success,
    ).toBe(true);
  });
});

describe("boothFormSchema", () => {
  const base = {
    name: "Test Stall",
    image_url: null,
    is_active: true,
    menu_items: [],
  };

  it("accepts a minimal valid booth (no id = create)", () => {
    expect(boothFormSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(boothFormSchema.safeParse({ ...base, name: "" }).success).toBe(
      false,
    );
  });

  it("accepts a uuid boothId (update)", () => {
    expect(
      boothFormSchema.safeParse({
        ...base,
        boothId: "742a0959-e065-41f8-ab27-27eaa3c02a1b",
      }).success,
    ).toBe(true);
  });

  it("accepts items with and without prices", () => {
    expect(
      boothFormSchema.safeParse({
        ...base,
        menu_items: [
          { id: "1", name: "Paid", price_cents: 500, available: true },
          { id: "2", name: "Free", available: false },
        ],
      }).success,
    ).toBe(true);
  });
});
```

> Note: the existing top of `schemas.test.ts` already imports `vendorSchema`. Replace that single import statement with the combined one above (do not leave a duplicate import).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/schemas.test.ts`
Expected: FAIL — `boothFormSchema` not exported / `menuItemSchema` rejects missing price.

- [ ] **Step 3: Edit `src/lib/schemas.ts`**

Make `price_cents` optional in the three relevant schemas. Change `menuItemSchema`:

```ts
export const menuItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  price_cents: z.number().int().nonnegative().optional(),
  available: z.boolean(),
});
```

Change `orderItemSchema`:

```ts
export const orderItemSchema = z.object({
  menuItemId: z.string(),
  name: z.string(),
  price_cents: z.number().int().nonnegative().optional(),
  quantity: z.number().int().min(1),
});
```

In `placeOrderSchema`, change the item `price_cents` line to:

```ts
        price_cents: z.number().int().positive().optional(),
```

Add the booth-form schemas after `vendorSchema` (before the read schemas section):

```ts
export const menuItemFormSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Item name is required").max(100),
  description: z.string().max(500).default(""),
  price_cents: z.number().int().nonnegative().optional(),
  available: z.boolean(),
});

export const boothFormSchema = z.object({
  boothId: z.string().uuid().optional(),
  name: z.string().min(1, "Booth name is required").max(100),
  image_url: z.string().url().nullable(),
  is_active: z.boolean(),
  menu_items: z.array(menuItemFormSchema),
});
```

Add to the type-exports section:

```ts
export type MenuItemFormInput = z.infer<typeof menuItemFormSchema>;
export type BoothFormInput = z.infer<typeof boothFormSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/schemas.test.ts`
Expected: PASS (3 vendor + 2 menuItem + 4 boothForm = 9).

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas.ts src/lib/schemas.test.ts
git commit -m "feat(schemas): optional price + boothFormSchema"
```

---

### Task 5: `placeOrder` — optional-price total

**Files:**

- Modify: `src/app/order/[boothId]/actions.ts:46-49`

No new unit test (Supabase-touching; covered by build + manual flow).

- [ ] **Step 1: Make the total tolerate missing prices**

Replace the `totalCents` computation:

```ts
const totalCents = order.items.reduce(
  (sum, item) => sum + (item.price_cents ?? 0) * item.quantity,
  0,
);
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: the `actions.ts` price error from Task 2 is gone. (Remaining errors are in `order-form.tsx`/`order-card.tsx`, fixed in Task 11.)

- [ ] **Step 3: Commit**

```bash
git add src/app/order/[boothId]/actions.ts
git commit -m "feat(orders): compute total with optional item prices"
```

---

### Task 6: `ImageUploader` (reusable)

**Files:**

- Create: `src/components/image-uploader.tsx`

No unit test (Storage-touching; verified by build + manual flow).

- [ ] **Step 1: Create `src/components/image-uploader.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

interface Props {
  vendorId: string;
  value: string | null;
  onChange: (url: string | null) => void;
}

export function ImageUploader({ vendorId, value, onChange }: Props) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Use a JPEG, PNG, or WebP image");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be 2 MB or smaller");
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${vendorId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("booth-images")
      .upload(path, file, { upsert: false });

    if (error) {
      toast.error("Upload failed");
      setUploading(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("booth-images").getPublicUrl(path);
    onChange(publicUrl);
    setUploading(false);
  }

  if (value) {
    return (
      <div className="relative h-40 w-full overflow-hidden rounded-xl border border-border">
        <Image
          src={value}
          alt="Booth banner"
          fill
          sizes="(max-width: 640px) 100vw, 28rem"
          className="object-cover"
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur hover:bg-background"
          aria-label="Remove image"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={uploading}
      className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-60"
    >
      {uploading ? (
        <Loader2 className="size-6 animate-spin" />
      ) : (
        <ImagePlus className="size-6" />
      )}
      <span className="text-sm font-medium">
        {uploading ? "Uploading…" : "Add a booth banner"}
      </span>
      <span className="text-xs">JPEG, PNG, or WebP · up to 2 MB</span>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </button>
  );
}
```

- [ ] **Step 2: Allow the Storage host in `next/image`**

`next/image` needs the Supabase host whitelisted. In `next.config.ts`, add an `images` block to `nextConfig` (the local + prod Supabase hosts):

```ts
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "54321" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 4: Commit**

```bash
git add src/components/image-uploader.tsx next.config.ts
git commit -m "feat(ui): reusable ImageUploader to Supabase Storage"
```

---

### Task 7: `MenuEditor`

**Files:**

- Create: `src/app/dashboard/booths/menu-editor.tsx`

No unit test (UI; verified by build + manual flow).

- [ ] **Step 1: Create `src/app/dashboard/booths/menu-editor.tsx`**

```tsx
"use client";

import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MenuItemFormInput } from "@/lib/schemas";

interface Props {
  items: MenuItemFormInput[];
  onChange: (items: MenuItemFormInput[]) => void;
}

function centsToDollars(cents?: number): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

export function MenuEditor({ items, onChange }: Props) {
  function update(index: number, patch: Partial<MenuItemFormInput>) {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function setPrice(index: number, dollars: string) {
    const trimmed = dollars.trim();
    if (trimmed === "") {
      update(index, { price_cents: undefined });
      return;
    }
    const value = Number(trimmed);
    if (Number.isNaN(value) || value < 0) return;
    update(index, { price_cents: Math.round(value * 100) });
  }

  function addItem() {
    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        name: "",
        description: "",
        price_cents: undefined,
        available: true,
      },
    ]);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Menu items
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={addItem}
        >
          <Plus className="size-3.5" /> Add item
        </Button>
      </div>

      {items.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No items yet. Add one — price is optional (leave blank for a
          queue-only booth).
        </p>
      )}

      <div className="space-y-3">
        {items.map((item, i) => (
          <div
            key={item.id}
            className="space-y-3 rounded-xl border border-border bg-card p-3.5"
          >
            <div className="flex gap-2">
              <Input
                placeholder="Item name"
                value={item.name}
                onChange={(e) => update(i, { name: e.target.value })}
                className="rounded-lg"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
                onClick={() => removeItem(i)}
                aria-label="Remove item"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <Input
              placeholder="Description (optional)"
              value={item.description}
              onChange={(e) => update(i, { description: e.target.value })}
              className="rounded-lg"
            />
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  inputMode="decimal"
                  placeholder="Price (optional)"
                  value={centsToDollars(item.price_cents)}
                  onChange={(e) => setPrice(i, e.target.value)}
                  className="rounded-lg pl-7"
                />
              </div>
              <label className="flex shrink-0 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.available}
                  onChange={(e) => update(i, { available: e.target.checked })}
                  className="size-4 accent-[var(--color-primary)]"
                />
                Available
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/booths/menu-editor.tsx
git commit -m "feat(ui): dynamic MenuEditor with optional price"
```

---

### Task 8: `saveBooth` server action

**Files:**

- Create: `src/app/dashboard/booths/actions.ts`

No unit test (Supabase-touching; covered by build + manual flow).

- [ ] **Step 1: Create `src/app/dashboard/booths/actions.ts`**

```ts
"use server";

import { createServerClient } from "@/lib/supabase/server";
import { boothFormSchema, type BoothFormInput } from "@/lib/schemas";

type SaveBoothResult =
  | { success: true; boothId: string }
  | { success: false; error: string };

export async function saveBooth(
  input: BoothFormInput,
): Promise<SaveBoothResult> {
  const parsed = boothFormSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: "Invalid booth details" };
  const data = parsed.data;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const row = {
    name: data.name,
    image_url: data.image_url,
    is_active: data.is_active,
    menu_items: data.menu_items,
  };

  if (data.boothId) {
    // RLS (booths_vendor_all) scopes the update to this vendor's own booths.
    const { data: updated, error } = await supabase
      .from("booths")
      .update(row)
      .eq("id", data.boothId)
      .select("id")
      .maybeSingle();
    if (error || !updated)
      return { success: false, error: "Could not save booth" };
    return { success: true, boothId: updated.id };
  }

  const { data: inserted, error } = await supabase
    .from("booths")
    .insert({ ...row, vendor_id: user.id })
    .select("id")
    .single();
  if (error || !inserted)
    return { success: false, error: "Could not create booth" };
  return { success: true, boothId: inserted.id };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/booths/actions.ts
git commit -m "feat(booths): saveBooth insert-or-update action"
```

---

### Task 9: `BoothForm`

**Files:**

- Create: `src/app/dashboard/booths/booth-form.tsx`

No unit test (UI; verified by build + manual flow).

- [ ] **Step 1: Create `src/app/dashboard/booths/booth-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/image-uploader";
import { MenuEditor } from "./menu-editor";
import { saveBooth } from "./actions";
import { boothFormSchema, type MenuItemFormInput } from "@/lib/schemas";

interface Props {
  vendorId: string;
  initial?: {
    boothId: string;
    name: string;
    image_url: string | null;
    is_active: boolean;
    menu_items: MenuItemFormInput[];
  };
}

export function BoothForm({ vendorId, initial }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(
    initial?.image_url ?? null,
  );
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [items, setItems] = useState<MenuItemFormInput[]>(
    initial?.menu_items ?? [],
  );
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const candidate = {
      boothId: initial?.boothId,
      name,
      image_url: imageUrl,
      is_active: isActive,
      menu_items: items,
    };
    const parsed = boothFormSchema.safeParse(candidate);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }

    setSaving(true);
    const result = await saveBooth(parsed.data);
    if (!result.success) {
      toast.error(result.error);
      setSaving(false);
      return;
    }
    toast.success("Booth saved");
    router.push("/dashboard/booths");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-8">
      <div className="space-y-2.5">
        <Label
          htmlFor="booth-name"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Booth name
        </Label>
        <Input
          id="booth-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mama's Kitchen"
          className="h-12 rounded-xl text-base"
        />
      </div>

      <div className="space-y-2.5">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Banner
        </Label>
        <ImageUploader
          vendorId={vendorId}
          value={imageUrl}
          onChange={setImageUrl}
        />
      </div>

      <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="size-4 accent-[var(--color-primary)]"
        />
        <span className="text-sm">
          <span className="font-medium">Active</span>
          <span className="block text-muted-foreground">
            Customers can only order from active booths.
          </span>
        </span>
      </label>

      <MenuEditor items={items} onChange={setItems} />

      <div className="flex gap-3">
        <Button
          type="submit"
          size="lg"
          className="h-12 flex-1 rounded-xl text-base font-semibold"
          disabled={saving}
        >
          {saving ? "Saving…" : "Save booth"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 rounded-xl"
          onClick={() => router.push("/dashboard/booths")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/booths/booth-form.tsx
git commit -m "feat(booths): BoothForm with image, active toggle, menu editor"
```

---

### Task 10: Booth list + new/edit pages + nav

**Files:**

- Create: `src/app/dashboard/booths/booth-list.tsx`
- Create: `src/app/dashboard/booths/page.tsx`
- Create: `src/app/dashboard/booths/new/page.tsx`
- Create: `src/app/dashboard/booths/[boothId]/page.tsx`
- Modify: `src/app/dashboard/layout.tsx`

No unit test (UI/Supabase; verified by build + manual flow).

- [ ] **Step 1: Create the client list `src/app/dashboard/booths/booth-list.tsx`**

```tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { Copy, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BoothRow {
  id: string;
  name: string;
  is_active: boolean;
  image_url: string | null;
  itemCount: number;
}

export function BoothList({ booths }: { booths: BoothRow[] }) {
  async function copyLink(id: string) {
    const url = `${window.location.origin}/order/${id}`;
    await navigator.clipboard.writeText(url);
    toast.success("Order link copied");
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {booths.map((booth) => (
        <div
          key={booth.id}
          className="ticket flex flex-col overflow-hidden rounded-xl border border-border"
        >
          <div className="relative h-28 w-full bg-muted">
            {booth.image_url && (
              <Image
                src={booth.image_url}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 20rem"
                className="object-cover"
              />
            )}
          </div>
          <div className="flex flex-1 flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-display text-lg font-semibold leading-tight">
                {booth.name}
              </p>
              <span
                className={`mt-1 inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold ${
                  booth.is_active
                    ? "text-status-ready"
                    : "text-muted-foreground"
                }`}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {booth.is_active ? "Active" : "Off"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {booth.itemCount} item{booth.itemCount === 1 ? "" : "s"}
            </p>
            <div className="mt-auto flex gap-2">
              <Button
                asChild
                size="sm"
                variant="outline"
                className="flex-1 rounded-lg"
              >
                <Link href={`/dashboard/booths/${booth.id}`}>
                  <Pencil className="size-3.5" /> Edit
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => copyLink(booth.id)}
                aria-label="Copy order link"
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create the list page `src/app/dashboard/booths/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVendor } from "@/lib/supabase/get-vendor";
import { createServerClient } from "@/lib/supabase/server";
import { parseMenuItems } from "@/lib/schemas";
import { BoothList } from "./booth-list";

export const revalidate = 0;

export default async function BoothsPage() {
  const { user, vendor } = await getVendor();
  if (!user) redirect("/login");
  if (!vendor) redirect("/onboarding");

  const supabase = await createServerClient();
  const { data: booths } = await supabase
    .from("booths")
    .select("id, name, is_active, image_url, menu_items")
    .eq("vendor_id", vendor.id)
    .order("created_at", { ascending: true });

  const rows = (booths ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    is_active: b.is_active,
    image_url: b.image_url,
    itemCount: parseMenuItems(b.menu_items).length,
  }));

  return (
    <div>
      <div className="mb-7 flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Your stalls
          </p>
          <h1 className="font-display text-4xl font-semibold leading-none">
            Booths
          </h1>
        </div>
        <Button asChild className="rounded-lg">
          <Link href="/dashboard/booths/new">
            <Plus className="size-4" /> New booth
          </Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="ticket mt-10 overflow-hidden rounded-2xl border border-dashed border-border py-16 text-center">
          <p className="font-display text-2xl font-semibold">No booths yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first booth to start taking orders.
          </p>
        </div>
      ) : (
        <BoothList booths={rows} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `src/app/dashboard/booths/new/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getVendor } from "@/lib/supabase/get-vendor";
import { BoothForm } from "../booth-form";

export const revalidate = 0;

export default async function NewBoothPage() {
  const { user, vendor } = await getVendor();
  if (!user) redirect("/login");
  if (!vendor) redirect("/onboarding");

  return (
    <div>
      <h1 className="font-display mb-6 text-3xl font-semibold">New booth</h1>
      <BoothForm vendorId={vendor.id} />
    </div>
  );
}
```

- [ ] **Step 4: Create `src/app/dashboard/booths/[boothId]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { getVendor } from "@/lib/supabase/get-vendor";
import { createServerClient } from "@/lib/supabase/server";
import { parseMenuItems } from "@/lib/schemas";
import { BoothForm } from "../booth-form";

export const revalidate = 0;

interface Props {
  params: Promise<{ boothId: string }>;
}

export default async function EditBoothPage({ params }: Props) {
  const { boothId } = await params;
  const { user, vendor } = await getVendor();
  if (!user) redirect("/login");
  if (!vendor) redirect("/onboarding");

  const supabase = await createServerClient();
  // RLS scopes this to the vendor's own booths; a foreign id returns null.
  const { data: booth } = await supabase
    .from("booths")
    .select("id, name, image_url, is_active, menu_items")
    .eq("id", boothId)
    .maybeSingle();

  if (!booth) notFound();

  const menuItems = parseMenuItems(booth.menu_items).map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    price_cents: m.price_cents,
    available: m.available,
  }));

  return (
    <div>
      <h1 className="font-display mb-6 text-3xl font-semibold">Edit booth</h1>
      <BoothForm
        vendorId={vendor.id}
        initial={{
          boothId: booth.id,
          name: booth.name,
          image_url: booth.image_url,
          is_active: booth.is_active,
          menu_items: menuItems,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Add the "Booths" nav link in `src/app/dashboard/layout.tsx`**

In the header, after the wordmark+vendor `<div>` and before the sign-out `<form>`, the layout currently has the wordmark block then the form. Wrap the right side so the nav sits between. Replace the inner flex row:

Find:

```tsx
<form action={signOut}>
  <Button variant="outline" size="sm" type="submit" className="rounded-lg">
    Sign out
  </Button>
</form>
```

Replace with:

```tsx
<div className="flex items-center gap-2">
  <Button asChild variant="ghost" size="sm" className="rounded-lg">
    <Link href="/dashboard">Orders</Link>
  </Button>
  <Button asChild variant="ghost" size="sm" className="rounded-lg">
    <Link href="/dashboard/booths">Booths</Link>
  </Button>
  <form action={signOut}>
    <Button variant="outline" size="sm" type="submit" className="rounded-lg">
      Sign out
    </Button>
  </form>
</div>
```

(`Link` is already imported in `layout.tsx`.)

- [ ] **Step 6: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors from these files.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/booths src/app/dashboard/layout.tsx
git commit -m "feat(booths): list + new/edit pages and dashboard nav"
```

---

### Task 11: Customer-side optional-price rendering

**Files:**

- Modify: `src/app/order/[boothId]/page.tsx`
- Modify: `src/app/order/[boothId]/order-form.tsx`
- Modify: `src/app/order/[boothId]/[orderNumber]/page.tsx`
- Modify: `src/components/order-card.tsx`

No unit test (UI; verified by build + manual flow).

- [ ] **Step 1: Booth banner on the order page**

In `src/app/order/[boothId]/page.tsx`: add the `image_url` to the select, and render a banner above the header. Change the select line:

```ts
    .select("id, name, image_url, menu_items")
```

Add `import Image from "next/image";` at the top, then place this directly inside the outer `<div>`, above `<header>`:

```tsx
{
  booth.image_url && (
    <div className="relative mb-5 h-40 w-full overflow-hidden rounded-2xl border border-border">
      <Image
        src={booth.image_url}
        alt=""
        fill
        sizes="(max-width: 640px) 100vw, 32rem"
        className="object-cover"
      />
    </div>
  );
}
```

- [ ] **Step 2: Optional price in `order-form.tsx`**

Add the import:

```ts
import { formatPrice, orderHasPricing } from "@/lib/utils";
```

(Replace the existing `import { formatPrice } from "@/lib/utils";`.)

Add a derived flag after `const hasItems = cartItems.length > 0;`:

```ts
const cartPriced = orderHasPricing(cartItems);
```

In the **menu list**, guard the per-item price line so it only renders when present:

```tsx
{
  item.price_cents != null && (
    <p className="mt-1 font-mono text-sm font-semibold text-primary">
      {formatPrice(item.price_cents)}
    </p>
  );
}
```

In the **cart summary**, guard the per-line amount and the total. Replace the per-line amount span:

```tsx
{
  item.price_cents != null && (
    <span className="shrink-0 font-mono text-muted-foreground">
      {formatPrice(item.price_cents * item.quantity)}
    </span>
  );
}
```

Wrap the Total block (the perforation + total row) in `{cartPriced && ( … )}`:

```tsx
{
  cartPriced && (
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
  );
}
```

In the **sticky submit bar**, change the label so it only appends the total when priced:

```tsx
{
  submitting
    ? "Placing order…"
    : hasItems
      ? cartPriced
        ? `Place order · ${formatPrice(total)}`
        : "Place order"
      : "Add items to order";
}
```

- [ ] **Step 3: Optional price on the status page `[orderNumber]/page.tsx`**

Add the import:

```ts
import { parseOrderItems } from "@/lib/schemas";
import { formatPrice, orderHasPricing } from "@/lib/utils";
```

(Merge with the existing `formatPrice` import — replace it with the line above; keep the existing `parseOrderItems` import as-is if already present.)

After `const items = parseOrderItems(order.items);` add:

```ts
const priced = orderHasPricing(items);
```

Guard the per-line amount:

```tsx
{
  priced && (
    <span className="shrink-0 font-mono text-muted-foreground">
      {formatPrice(item.price_cents * item.quantity)}
    </span>
  );
}
```

Wrap the Total row in `{priced && ( … )}`:

```tsx
{
  priced && (
    <div className="mt-1 flex justify-between border-t border-border/60 pt-3 font-semibold">
      <span>Total</span>
      <span className="font-mono">{formatPrice(order.total_cents)}</span>
    </div>
  );
}
```

- [ ] **Step 4: Optional price in `order-card.tsx`**

Add the import:

```ts
import { formatPrice, orderHasPricing } from "@/lib/utils";
```

(Replace the existing `import { formatPrice } from "@/lib/utils";`.)

After `const items = parseOrderItems(order.items);` add:

```ts
const priced = orderHasPricing(items);
```

Guard the per-line amount:

```tsx
{
  priced && (
    <span className="shrink-0 font-mono text-muted-foreground">
      {formatPrice(item.price_cents * item.quantity)}
    </span>
  );
}
```

Wrap the perforation + Total block in `{priced && ( … )}`:

```tsx
{
  priced && (
    <>
      <div className="perforation mx-4" />
      <div className="flex items-baseline justify-between px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Total
        </span>
        <span className="font-mono text-lg font-bold">
          {formatPrice(order.total_cents)}
        </span>
      </div>
    </>
  );
}
```

> Note: when `priced` is false, the layout above still needs the perforation that previously separated items from the actions. Keep the existing `<div className="perforation mx-4" />` that sits _before_ the items block as-is; only the total-row perforation is conditional.

- [ ] **Step 5: Verify it all compiles**

Run: `pnpm exec tsc --noEmit`
Expected: zero errors (all optional-price arithmetic now guarded by `price_cents != null` / `priced`).

- [ ] **Step 6: Commit**

```bash
git add src/app/order src/components/order-card.tsx
git commit -m "feat(orders): hide prices/total when items are unpriced; booth banner"
```

---

### Task 12: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Static checks**

Run: `pnpm check`
Expected: prettier + eslint + tsc all pass. (If prettier flags files, run `pnpm format` and re-run.)

- [ ] **Step 2: Tests**

Run: `pnpm test`
Expected: all pass (utils 12 + schemas 9).

- [ ] **Step 3: Build**

Run: `rm -rf .next && pnpm build`
Expected: compiles; route list includes `/dashboard/booths`, `/dashboard/booths/new`, `/dashboard/booths/[boothId]`.

- [ ] **Step 4: Manual flow (dev on http://localhost:3000, signed in as the seeded vendor)**

1. Header → **Booths** → see "Test Stall".
2. **Edit** it → rename to "Test Stall 2", upload a banner (≤2 MB jpg/png/webp), add a **priced** item and an **unpriced** item, Save → redirected to the list; thumbnail + new name show.
3. Confirm DB:
   ```bash
   docker exec $(docker ps --filter name=supabase_db --format "{{.Names}}") \
     psql -U postgres -d postgres -c "select name, image_url, jsonb_array_length(menu_items) from booths;"
   ```
   Expected: new name, non-null `image_url`, item count updated.
4. Open the customer page `/order/<boothId>` → banner shows; the unpriced item has no price; priced item shows price.
5. Place an order with **only the unpriced item** → status page shows **no total**; dashboard card shows no total.
6. Place an order **including the priced item** → total shows on cart, status page, and dashboard card.
7. Create a **new** booth via "+ New booth" with no banner and one unpriced item → appears in the list; its `/order/<id>` page works with no money anywhere.

- [ ] **Step 5: Final commit (if any fixups were needed)**

```bash
git add -A
git commit -m "chore(booths): verification fixups"
```

---

## Self-Review Notes

- **Spec coverage:** image_url + bucket + storage RLS (T1); types (T2); `orderHasPricing` (T3); optional-price schemas + `boothFormSchema` (T4); optional-price order total (T5); reusable `ImageUploader` (T6); `MenuEditor` (T7); `saveBooth` insert-or-update, RLS-scoped (T8); `BoothForm` (T9); list/new/edit pages + nav (T10); customer-side hiding + banner (T11); verification incl. edit-seeded-data flow (T12). All spec sections mapped.
- **Type consistency:** `BoothFormInput`/`MenuItemFormInput` (T4) consumed by `MenuEditor` (T7), `BoothForm` (T9), `saveBooth` (T8). `orderHasPricing(items: { price_cents?: number | null }[])` (T3) used in T11. `image_url: string | null` (T2) used in T8/T9/T10/T11.
- **Optional-price guards:** every `price_cents` arithmetic site (order-form menu/cart, status page, order-card, placeOrder total) is guarded by `price_cents != null` or `priced`/`cartPriced` — no `number | undefined` multiplication remains.
- **Deactivate not delete:** no delete path anywhere; `is_active` toggle only (T9).
