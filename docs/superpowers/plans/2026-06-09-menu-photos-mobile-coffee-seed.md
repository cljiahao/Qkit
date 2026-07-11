# Per-item Photos, Mobile, Coffee-Cart Seed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional per-item menu photos (vendor-editable, customer-visible), make every surface read well on a phone, and seed a "Kopitiam Cart" booth with hand-authored ingredient-style SVG art per Singapore coffee drink.

**Architecture:** Menu items gain an optional `image_url`. A single svg-aware `MediaImage` wrapper replaces every `next/image` usage that renders a stored image URL (banners + new thumbnails), setting `unoptimized` only for `.svg` sources so we avoid the global `dangerouslyAllowSVG` flag. The reusable `ImageUploader` grows a compact `thumb` variant for the menu editor. The coffee booth attaches to the existing "Test" vendor as a second booth via a manual SQL seed; its art is static SVG under `/public/seed/`.

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Zod, Tailwind v4, Supabase (`@supabase/ssr`), Vitest.

**Key IDs (local dev):**

- Test vendor id: `6df824a1-9da2-4608-ad13-2400a9114ec0`
- Coffee booth fixed id (this plan): `c0ffee01-0000-4000-8000-000000000001`

---

## File Structure

- `src/lib/types.ts` — add `image_url?: string | null` to `MenuItem`.
- `src/lib/schemas.ts` — `menuImageUrl` validator; add `image_url` to `menuItemSchema` (read) + `menuItemFormSchema` (write).
- `src/lib/schemas.test.ts` — `image_url` cases.
- `src/components/media-image.tsx` — **new** svg-aware `next/image` wrapper.
- `src/components/image-uploader.tsx` — `variant?: "banner" | "thumb"`; preview via `MediaImage`.
- `src/app/dashboard/booths/menu-editor.tsx` — per-row thumbnail uploader; `image_url` in row state; `vendorId` prop.
- `src/app/dashboard/booths/booth-form.tsx` — pass `vendorId` to `MenuEditor`.
- `src/app/dashboard/booths/[boothId]/page.tsx` — include `image_url` when mapping stored items to form items.
- `src/app/order/[boothId]/order-form.tsx` — leading thumbnail per menu row.
- `src/app/order/[boothId]/page.tsx`, `src/app/dashboard/booths/booth-list.tsx` — banner via `MediaImage`.
- `src/app/dashboard/layout.tsx` — header wraps on narrow screens.
- `public/seed/*.svg` — **new** authored art (7 cups + 1 chart banner).
- `supabase/seed/coffee-cart.sql` — **new** manual seed.

---

## Phase 1 — Data + schema foundation

### Task 1: Add `image_url` to menu item types + schemas

**Files:**

- Modify: `src/lib/types.ts:17-23`
- Modify: `src/lib/schemas.ts`
- Test: `src/lib/schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/schemas.test.ts` inside a new describe block (keep existing imports; add `menuItemFormSchema` to the import from `./schemas` if not already present — it is not, add it):

```ts
describe("menuItemFormSchema image_url", () => {
  const base = { id: "1", name: "Kopi O", description: "", available: true };

  it("accepts a bucket URL", () => {
    expect(
      menuItemFormSchema.safeParse({
        ...base,
        image_url: "https://abc.supabase.co/storage/v1/object/public/x.png",
      }).success,
    ).toBe(true);
  });

  it("accepts a relative /seed path", () => {
    expect(
      menuItemFormSchema.safeParse({ ...base, image_url: "/seed/kopi-o.svg" })
        .success,
    ).toBe(true);
  });

  it("accepts null", () => {
    expect(
      menuItemFormSchema.safeParse({ ...base, image_url: null }).success,
    ).toBe(true);
  });

  it("accepts a missing image_url", () => {
    expect(menuItemFormSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a bare non-url, non-path string", () => {
    expect(
      menuItemFormSchema.safeParse({ ...base, image_url: "kopi" }).success,
    ).toBe(false);
  });
});
```

Update the import line at the top of the test file to include `menuItemFormSchema`:

```ts
import {
  vendorSchema,
  menuItemSchema,
  menuItemFormSchema,
  boothFormSchema,
  placeOrderSchema,
} from "./schemas";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/schemas.test.ts`
Expected: FAIL — the relative-path case fails (no `image_url` field yet means unknown key is stripped, so `/seed/...` "passes" only if absent; the reject case fails because `image_url` is ignored). Confirm red before implementing.

- [ ] **Step 3: Add the `menuImageUrl` validator and wire it into both schemas**

In `src/lib/schemas.ts`, add this validator above `menuItemFormSchema`:

```ts
// Menu-item images come from two sources: the uploader (absolute Supabase URL)
// and seeded art (relative `/seed/...` path). z.string().url() rejects the
// latter, so accept either an http(s) URL or a leading-slash local path.
const menuImageUrl = z
  .string()
  .refine((s) => /^https?:\/\//.test(s) || s.startsWith("/"), {
    message: "Must be a URL or a local path",
  })
  .nullable()
  .optional();
```

Add `image_url: menuImageUrl,` to `menuItemFormSchema`:

```ts
export const menuItemFormSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Item name is required").max(100),
  description: z.string().max(500).default(""),
  price_cents: z.number().int().nonnegative().optional(),
  image_url: menuImageUrl,
  available: z.boolean(),
});
```

Add the same field to the read schema `menuItemSchema`:

```ts
export const menuItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  price_cents: z.number().int().nonnegative().optional(),
  image_url: menuImageUrl,
  available: z.boolean(),
});
```

- [ ] **Step 4: Add `image_url` to the `MenuItem` type**

In `src/lib/types.ts`, update `MenuItem`:

```ts
export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price_cents?: number;
  image_url?: string | null;
  available: boolean;
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- src/lib/schemas.test.ts`
Expected: PASS (all new cases + existing cases green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/schemas.ts src/lib/schemas.test.ts
git commit -m "feat(menu): optional image_url on menu items (types + schema)"
```

---

## Phase 2 — Shared svg-aware image rendering

### Task 2: `MediaImage` wrapper + swap banner usages

`next/image` refuses SVG unless `unoptimized` is set. The coffee booth banner and per-item art are SVG, so every place that renders a stored image URL must use this wrapper.

**Files:**

- Create: `src/components/media-image.tsx`
- Modify: `src/app/order/[boothId]/page.tsx:28-38`
- Modify: `src/app/dashboard/booths/booth-list.tsx:31-41`

- [ ] **Step 1: Create the wrapper**

`src/components/media-image.tsx`:

```tsx
import Image, { type ImageProps } from "next/image";

/**
 * next/image wrapper that renders SVG sources without the global
 * `dangerouslyAllowSVG` flag by marking only `.svg` URLs as unoptimized.
 * Raster images (vendor uploads) still get full optimization.
 */
export function MediaImage(props: ImageProps) {
  const isSvg = typeof props.src === "string" && props.src.endsWith(".svg");
  return <Image {...props} unoptimized={isSvg || props.unoptimized} />;
}
```

- [ ] **Step 2: Use it for the customer booth banner**

In `src/app/order/[boothId]/page.tsx`, replace the `import Image from "next/image";` line with:

```tsx
import { MediaImage } from "@/components/media-image";
```

and replace the `<Image ... />` banner element (the one inside the `booth.image_url &&` block) with:

```tsx
<MediaImage
  src={booth.image_url}
  alt=""
  fill
  sizes="(max-width: 640px) 100vw, 32rem"
  className="object-cover"
/>
```

- [ ] **Step 3: Use it for the booth-list thumbnail banner**

In `src/app/dashboard/booths/booth-list.tsx`, replace `import Image from "next/image";` with:

```tsx
import { MediaImage } from "@/components/media-image";
```

and replace the `<Image ... />` element with:

```tsx
<MediaImage
  src={booth.image_url}
  alt=""
  fill
  sizes="(max-width: 640px) 100vw, 20rem"
  className="object-cover"
/>
```

- [ ] **Step 4: Verify typecheck + build of the touched pages**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 5: Commit**

```bash
git add src/components/media-image.tsx src/app/order/[boothId]/page.tsx src/app/dashboard/booths/booth-list.tsx
git commit -m "feat(images): svg-aware MediaImage wrapper for stored banners"
```

---

## Phase 3 — Photo editing + customer display

### Task 3: `variant` prop on `ImageUploader`

**Files:**

- Modify: `src/components/image-uploader.tsx`

- [ ] **Step 1: Add the variant prop and svg-aware preview**

Replace the contents of `src/components/image-uploader.tsx` with:

```tsx
"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { MediaImage } from "@/components/media-image";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

interface Props {
  vendorId: string;
  value: string | null;
  onChange: (url: string | null) => void;
  variant?: "banner" | "thumb";
}

export function ImageUploader({
  vendorId,
  value,
  onChange,
  variant = "banner",
}: Props) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const box = variant === "thumb" ? "size-20 shrink-0" : "h-40 w-full";

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
      <div
        className={`relative overflow-hidden rounded-xl border border-border ${box}`}
      >
        <MediaImage
          src={value}
          alt=""
          fill
          sizes={
            variant === "thumb" ? "5rem" : "(max-width: 640px) 100vw, 28rem"
          }
          className="object-cover"
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur hover:bg-background"
          aria-label="Remove image"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={uploading}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-60 ${box}`}
    >
      {uploading ? (
        <Loader2
          className={
            variant === "thumb" ? "size-4 animate-spin" : "size-6 animate-spin"
          }
        />
      ) : (
        <ImagePlus className={variant === "thumb" ? "size-4" : "size-6"} />
      )}
      {variant === "banner" && (
        <>
          <span className="text-sm font-medium">
            {uploading ? "Uploading…" : "Add a booth banner"}
          </span>
          <span className="text-xs">JPEG, PNG, or WebP · up to 2 MB</span>
        </>
      )}
      {variant === "thumb" && (
        <span className="text-[10px] font-medium leading-tight">
          {uploading ? "…" : "Photo"}
        </span>
      )}
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

- [ ] **Step 2: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/image-uploader.tsx
git commit -m "feat(images): thumb variant for ImageUploader"
```

---

### Task 4: Per-row photo in the menu editor

**Files:**

- Modify: `src/app/dashboard/booths/menu-editor.tsx`
- Modify: `src/app/dashboard/booths/booth-form.tsx:108`
- Modify: `src/app/dashboard/booths/[boothId]/page.tsx:29-35`

- [ ] **Step 1: Accept `vendorId` and render a thumbnail uploader per row**

In `src/app/dashboard/booths/menu-editor.tsx`:

Update the imports to add the uploader:

```tsx
import { ImageUploader } from "@/components/image-uploader";
```

Update `Props` and the component signature:

```tsx
interface Props {
  vendorId: string;
  items: MenuItemFormInput[];
  onChange: (items: MenuItemFormInput[]) => void;
}

export function MenuEditor({ vendorId, items, onChange }: Props) {
```

Update `addItem` to default `image_url`:

```tsx
function addItem() {
  onChange([
    ...items,
    {
      id: crypto.randomUUID(),
      name: "",
      description: "",
      price_cents: undefined,
      image_url: null,
      available: true,
    },
  ]);
}
```

Replace the row's top `<div className="flex gap-2">` block (name input + delete button) with a version that places a thumbnail uploader on the left:

```tsx
<div className="flex gap-2">
  <ImageUploader
    vendorId={vendorId}
    value={item.image_url ?? null}
    onChange={(url) => update(i, { image_url: url })}
    variant="thumb"
  />
  <div className="flex flex-1 flex-col gap-2">
    <Input
      placeholder="Item name"
      value={item.name}
      onChange={(e) => update(i, { name: e.target.value })}
      className="rounded-lg"
    />
    <Input
      placeholder="Description (optional)"
      value={item.description}
      onChange={(e) => update(i, { description: e.target.value })}
      className="rounded-lg"
    />
  </div>
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
```

Then DELETE the now-duplicated standalone description `<Input>` that previously sat between the name row and the price row (the one with `placeholder="Description (optional)"` outside the flex block) — description now lives inside the new block above.

- [ ] **Step 2: Pass `vendorId` from the booth form**

In `src/app/dashboard/booths/booth-form.tsx`, update the `MenuEditor` usage:

```tsx
<MenuEditor vendorId={vendorId} items={items} onChange={setItems} />
```

- [ ] **Step 3: Carry `image_url` through the edit page mapping**

In `src/app/dashboard/booths/[boothId]/page.tsx`, update the `menuItems` map to include `image_url`:

```tsx
const menuItems = parseMenuItems(booth.menu_items).map((m) => ({
  id: m.id,
  name: m.name,
  description: m.description,
  price_cents: m.price_cents,
  image_url: m.image_url ?? null,
  available: m.available,
}));
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/booths/menu-editor.tsx src/app/dashboard/booths/booth-form.tsx "src/app/dashboard/booths/[boothId]/page.tsx"
git commit -m "feat(menu): per-item photo upload in menu editor"
```

---

### Task 5: Leading thumbnail on the customer menu

**Files:**

- Modify: `src/app/order/[boothId]/order-form.tsx:102-125`

- [ ] **Step 1: Render a thumbnail before each menu item's text**

In `src/app/order/[boothId]/order-form.tsx`, add the import:

```tsx
import { MediaImage } from "@/components/media-image";
```

Replace the menu row's inner `<div className="min-w-0 flex-1">…</div>` (the item name/description/price block) so it is preceded by a thumbnail and wrapped together:

```tsx
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
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/order/[boothId]/order-form.tsx"
git commit -m "feat(order): show per-item photo thumbnails on customer menu"
```

---

## Phase 4 — Coffee-cart seed

### Task 6: Author the SVG art

Each cup uses one 160×200 template: a glass outline, a liquid fill, an optional bottom milk band, optional sugar-cube squares near the rim, and a label. Colors are fixed below; produce one file per drink by swapping base color, milk band, and sugar flag. Plus one wide chart banner.

**Files:**

- Create: `public/seed/kopi-o.svg`
- Create: `public/seed/kopi.svg`
- Create: `public/seed/kopi-c.svg`
- Create: `public/seed/teh.svg`
- Create: `public/seed/teh-o.svg`
- Create: `public/seed/teh-c.svg`
- Create: `public/seed/milo.svg`
- Create: `public/seed/kopitiam-chart.svg`

**Recipe table (base = liquid fill, milk band = bottom layer, sugar = two cube squares near rim):**

| File         | base color (liquid) | milk band            | sugar | label  |
| ------------ | ------------------- | -------------------- | ----- | ------ |
| `kopi-o.svg` | `#2a1a10` coffee    | none                 | yes   | KOPI O |
| `kopi.svg`   | `#3a2419` coffee    | `#f2e2bd` condensed  | no    | KOPI   |
| `kopi-c.svg` | `#3a2419` coffee    | `#ece0c4` evaporated | yes   | KOPI C |
| `teh.svg`    | `#c06a1f` tea       | `#f2e2bd` condensed  | no    | TEH    |
| `teh-o.svg`  | `#c8771f` tea       | none                 | yes   | TEH O  |
| `teh-c.svg`  | `#c06a1f` tea       | `#ece0c4` evaporated | yes   | TEH C  |
| `milo.svg`   | `#5a3a1a` malt      | `#f2e2bd` condensed  | no    | MILO   |

- [ ] **Step 1: Write the reference cup (Kopi O)**

`public/seed/kopi-o.svg` — this is the template. For each other drink, copy this file and change: the liquid `<rect>` fill, add/remove the milk-band `<rect>`, keep/remove the two sugar `<rect>` squares, and change the `<text>` label.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 200" role="img" aria-label="Kopi O">
  <rect width="160" height="200" fill="#faf3e6"/>
  <!-- saucer -->
  <ellipse cx="80" cy="170" rx="54" ry="9" fill="#e3d4b8"/>
  <!-- glass body -->
  <path d="M44 70 h72 l-7 86 a9 9 0 0 1 -9 8 H60 a9 9 0 0 1 -9 -8 Z" fill="#ffffff" stroke="#8a6d4f" stroke-width="3"/>
  <!-- liquid (base color) -->
  <path d="M49 96 h62 l-5 60 a9 9 0 0 1 -9 8 H63 a9 9 0 0 1 -9 -8 Z" fill="#2a1a10"/>
  <!-- MILK BAND: present only for kopi/kopi-c/teh/teh-c/milo. Omit for *-o drinks.
       <path d="M52 138 h56 l-2 18 a9 9 0 0 1 -9 8 H63 a9 9 0 0 1 -9 -8 Z" fill="#f2e2bd"/> -->
  <!-- SUGAR cubes: present when sugar=yes -->
  <rect x="60" y="80" width="12" height="12" rx="2" fill="#ffffff" stroke="#caa96f" stroke-width="2"/>
  <rect x="78" y="84" width="12" height="12" rx="2" fill="#ffffff" stroke="#caa96f" stroke-width="2"/>
  <!-- label -->
  <text x="80" y="190" text-anchor="middle" font-family="monospace" font-size="15" font-weight="700" fill="#3a2419">KOPI O</text>
</svg>
```

- [ ] **Step 2: Produce the other six cups from the template**

Create each remaining file by copying `kopi-o.svg` and applying its row from the recipe table:

- Change the liquid `<path … fill="…">` to the base color.
- If the row has a milk band, uncomment/add the milk-band `<path>` (the commented one above) with the band color. If "none", omit it.
- If sugar = no, delete the two sugar `<rect>` squares. If yes, keep them.
- Change the `<text>` label and the `aria-label`.

- [ ] **Step 3: Write the chart banner**

`public/seed/kopitiam-chart.svg` — a wide banner (viewBox `0 0 800 240`) with a title and a row of seven small labelled swatches mirroring the recipe (base swatch + milk dot + sugar marks). Keep it simple and legible:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 240" role="img" aria-label="Kopitiam drinks chart">
  <rect width="800" height="240" fill="#3a2419"/>
  <text x="400" y="52" text-anchor="middle" font-family="monospace" font-size="34" font-weight="800" fill="#faf3e6" letter-spacing="3">KOPITIAM CART</text>
  <text x="400" y="80" text-anchor="middle" font-family="monospace" font-size="14" fill="#caa96f">kopi o · kopi · kopi c · teh · teh o · teh c · milo</text>
  <g font-family="monospace" font-size="13" font-weight="700" fill="#faf3e6" text-anchor="middle">
    <!-- 7 columns at x = 80,180,...,680 -->
    <g transform="translate(80,150)"><circle r="34" fill="#2a1a10" stroke="#caa96f" stroke-width="3"/><text y="64">KOPI O</text></g>
    <g transform="translate(180,150)"><circle r="34" fill="#3a2419" stroke="#caa96f" stroke-width="3"/><circle cy="20" r="10" fill="#f2e2bd"/><text y="64">KOPI</text></g>
    <g transform="translate(280,150)"><circle r="34" fill="#3a2419" stroke="#caa96f" stroke-width="3"/><circle cy="20" r="10" fill="#ece0c4"/><text y="64">KOPI C</text></g>
    <g transform="translate(400,150)"><circle r="34" fill="#c06a1f" stroke="#caa96f" stroke-width="3"/><circle cy="20" r="10" fill="#f2e2bd"/><text y="64">TEH</text></g>
    <g transform="translate(520,150)"><circle r="34" fill="#c8771f" stroke="#caa96f" stroke-width="3"/><text y="64">TEH O</text></g>
    <g transform="translate(620,150)"><circle r="34" fill="#c06a1f" stroke="#caa96f" stroke-width="3"/><circle cy="20" r="10" fill="#ece0c4"/><text y="64">TEH C</text></g>
    <g transform="translate(720,150)"><circle r="34" fill="#5a3a1a" stroke="#caa96f" stroke-width="3"/><circle cy="20" r="10" fill="#f2e2bd"/><text y="64">MILO</text></g>
  </g>
</svg>
```

- [ ] **Step 4: Sanity-check the SVGs render**

Run: `pnpm dev` (if not already running) and open `http://localhost:3000/seed/kopi-o.svg` and `http://localhost:3000/seed/kopitiam-chart.svg` in a browser.
Expected: each SVG displays (static files under `/public` are served as-is).

- [ ] **Step 5: Commit**

```bash
git add public/seed
git commit -m "feat(seed): kopitiam ingredient-style SVG art"
```

---

### Task 7: Coffee-cart seed SQL

**Files:**

- Create: `supabase/seed/coffee-cart.sql`

- [ ] **Step 1: Write the seed**

`supabase/seed/coffee-cart.sql` — attaches a second booth to the existing Test vendor. Re-runnable via `on conflict (id) do update`. Menu items carry `image_url` pointing at the seed art.

```sql
-- Kopitiam Cart: a second booth under the existing "Test" vendor.
-- vendors.id is FK to auth.users.id, so we reuse the real Test vendor instead
-- of fabricating an auth user. Run manually (see Step 2); never via `db reset`.
insert into public.booths (id, vendor_id, name, is_active, image_url, menu_items)
values (
  'c0ffee01-0000-4000-8000-000000000001',
  '6df824a1-9da2-4608-ad13-2400a9114ec0',
  'Kopitiam Cart',
  true,
  '/seed/kopitiam-chart.svg',
  '[
    {"id":"k-kopi-o","name":"Kopi O","description":"Black coffee, sugar","price_cents":140,"image_url":"/seed/kopi-o.svg","available":true},
    {"id":"k-kopi","name":"Kopi","description":"Coffee with condensed milk","price_cents":160,"image_url":"/seed/kopi.svg","available":true},
    {"id":"k-kopi-c","name":"Kopi C","description":"Coffee, evaporated milk, sugar","price_cents":170,"image_url":"/seed/kopi-c.svg","available":true},
    {"id":"k-teh","name":"Teh","description":"Tea with condensed milk","price_cents":160,"image_url":"/seed/teh.svg","available":true},
    {"id":"k-teh-o","name":"Teh O","description":"Tea, sugar","price_cents":140,"image_url":"/seed/teh-o.svg","available":true},
    {"id":"k-teh-c","name":"Teh C","description":"Tea, evaporated milk, sugar","price_cents":170,"image_url":"/seed/teh-c.svg","available":true},
    {"id":"k-milo","name":"Milo","description":"Malt, condensed milk","price_cents":200,"image_url":"/seed/milo.svg","available":true}
  ]'::jsonb
)
on conflict (id) do update
  set name = excluded.name,
      is_active = excluded.is_active,
      image_url = excluded.image_url,
      menu_items = excluded.menu_items;
```

- [ ] **Step 2: Apply the seed to the local DB**

Run (PowerShell; pipes the file into the Postgres container — same method used for Test Stall):

```powershell
Get-Content supabase/seed/coffee-cart.sql -Raw | docker exec -i supabase_db_qkit psql -U postgres -d postgres
```

Expected: `INSERT 0 1` (or `UPDATE 1` on a re-run).

> If the container name differs, find it with `docker ps --format "{{.Names}}"` and use the one ending in `_db_...`.

- [ ] **Step 3: Verify the booth + its order page**

Open `http://localhost:3000/order/c0ffee01-0000-4000-8000-000000000001`.
Expected: "Kopitiam Cart" banner (chart SVG), seven drinks each with an ingredient thumbnail and SGD price.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed/coffee-cart.sql
git commit -m "feat(seed): kopitiam cart booth seed"
```

---

## Phase 5 — Mobile polish

### Task 8: Mobile audit + targeted fixes

Most grids already collapse to one column on phones (`grid-cols-1 sm:…`). This task makes the one known desktop-first fix and verifies every surface at 375px width.

**Files:**

- Modify: `src/app/dashboard/layout.tsx:34`

- [ ] **Step 1: Let the dashboard header wrap on narrow screens**

In `src/app/dashboard/layout.tsx`, the header inner row can overflow on phones (logo + name + three buttons). Update the wrapper `<div>` at line 34 to allow wrapping and tighten gaps:

```tsx
<div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-y-2">
```

- [ ] **Step 2: Manual viewport audit at 375px**

Run `pnpm dev`, open DevTools device toolbar at 375×812, and check each surface. Fix any horizontal overflow or cramped control with Tailwind responsive prefixes (mobile = default):

- [ ] `/login` — Google button, email/password, toggle all reachable, no overflow.
- [ ] `/onboarding` — stall-name input + Continue button spacing intact.
- [ ] `/dashboard` — live order board single column, cards full-width, header wraps cleanly.
- [ ] `/dashboard/booths` — booth cards single column.
- [ ] `/dashboard/booths/new` and `/dashboard/booths/<coffee id>` — booth form usable; menu editor rows (thumb + name/description + delete) don't overflow; price + Available row fits.
- [ ] `/order/<coffee id>` — banner, menu rows with thumbnails, sticky submit bar all fit; thumbnails don't push price off-screen.
- [ ] `/order/<coffee id>/<orderNumber>` (place a test order first) — ticket centered, no overflow.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/layout.tsx
git commit -m "fix(dashboard): wrap header on narrow screens"
```

> If the audit surfaces additional fixes, make them as small focused edits and fold them into this commit (or a follow-up `fix(mobile): …` commit).

---

## Phase 6 — Final verification

### Task 9: Full gate

- [ ] **Step 1: Run the full check + tests + build**

```bash
pnpm check
pnpm test
pnpm build
```

Expected: `pnpm check` clean (prettier + eslint + tsc), `pnpm test` all green, `pnpm build` succeeds.

- [ ] **Step 2: Fix any failures**

If prettier flags formatting, run `pnpm format` and re-stage. If tsc/eslint/test fail, fix the root cause (do not weaken types or skip tests). Re-run until green.

- [ ] **Step 3: Final commit (only if Step 2 changed files)**

```bash
git add -A
git commit -m "chore: format + verification fixes for round-2 features"
```

---

## Self-Review notes (author)

- **Spec coverage:** A. photos → Tasks 1,3,4,5 (+ MediaImage in 2). B. mobile → Task 8 (+ already-responsive grids). C. coffee seed → Tasks 6,7. Testing → Task 1 (schema) + manual checks in 6,7,8 + gate in 9. ✓
- **Banner-SVG correctness:** the coffee booth banner is SVG, so MediaImage (Task 2) covers booth-list + order page + uploader preview (Task 3). ✓
- **Type consistency:** `image_url?: string | null` on `MenuItem`; `menuImageUrl` (`nullable().optional()`) on both schemas; `MenuItemFormInput` inferred — `image_url` flows through booth-form initial, edit-page map (Task 4 Step 3), and `addItem` default. ✓
- **No placeholders:** SVG cups are a parameterized template + explicit recipe table (deterministic), not "TBD". Mobile audit lists exact viewports + the one known code fix. ✓

```

```
