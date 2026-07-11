# Booth & Menu Management — Design

**Date:** 2026-06-09
**Status:** Approved (pending spec review)

## Goal

Let a signed-in vendor create and edit their own booths in-app — booth name, a
banner image, an active toggle, and a menu editor — instead of editing the
database by hand. Menu item prices become **optional** so a booth can run as a
queue system (no payment) as easily as a payment system.

## Background / current state

- `booths` table: `id, vendor_id, name, menu_items JSONB, is_active, created_at`.
  No image column. No booth-management UI exists; booths are created via SQL.
- `menu_items` JSONB element shape (today): `{ id, name, description, price_cents, available }`
  with `price_cents` required (`menuItemSchema` in `src/lib/schemas.ts`).
- `orders.total_cents` is `NOT NULL CHECK (total_cents >= 0)`.
- RLS: `booths_vendor_all` (`vendor_id = auth.uid()`) already lets a vendor
  INSERT/UPDATE/DELETE their own booths; `booths_public_read` exposes active
  booths to customers. No schema change to policies is required for booth CRUD.
- Design system: "Kraft & Ember" (see `[[qkit-design-system]]`) — reuse its
  tokens, fonts, and ticket motif for all new UI.

## Decisions

- **Pricing:** per-item optional price. Each menu item may omit `price_cents`.
- **Images:** booth banner only (no per-item photos). Reusable upload component
  so per-item photos are a cheap later follow-up.
- **Delete:** no hard delete — deactivate via the `is_active` toggle (an
  `orders.booth_id` FK without cascade makes hard-deleting a booth-with-orders
  unsafe).
- **No menu reordering** (YAGNI).
- **Image upload** runs client-side via the authenticated Supabase browser
  client; Storage RLS enforces the per-vendor path.

## Data model changes (migration `0002`)

1. `ALTER TABLE public.booths ADD COLUMN image_url TEXT;` (nullable).
2. Create a **public-read** Storage bucket `booth-images`.
3. Storage RLS policies on `storage.objects` for bucket `booth-images`:
   - **public SELECT** (anyone can read banner images).
   - **vendor INSERT/UPDATE/DELETE** restricted to objects whose first path
     segment equals the vendor's `auth.uid()` — i.e. path
     `"{auth.uid()}/{filename}"`. Implemented with
     `(storage.foldername(name))[1] = auth.uid()::text`.

No DDL for optional pricing — `menu_items` is JSONB; only Zod changes.

Per project rule, `src/lib/types.ts` is updated alongside the migration: add
`image_url: string | null` to the `booths` Row/Insert/Update types.

`orders.total_cents` stays `NOT NULL` and is purely a stored sum (`0` when no
item is priced). It does **not** drive UI. Whether money is shown is decided in
exactly one place — `orderHasPricing(items)` (see Total computation) — so the
column and the display rule never disagree.

## Schema / validation changes (`src/lib/schemas.ts`)

- `menuItemSchema`: `price_cents` → `z.number().int().nonnegative().optional()`.
- `orderItemSchema`: `price_cents` → `.optional()` (orders may store unpriced
  items). `parseOrderItems` / `parseMenuItems` remain tolerant.
- `placeOrderSchema` (write boundary): item `price_cents` → `.optional()`.
- New `boothFormSchema`:
  ```
  boothFormSchema = z.object({
    boothId: z.string().uuid().optional(),     // present => update
    name: z.string().min(1).max(100),
    image_url: z.string().url().nullable(),
    is_active: z.boolean(),
    menu_items: z.array(menuItemFormSchema),
  })
  menuItemFormSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(100),
    description: z.string().max(500).default(""),
    price_cents: z.number().int().nonnegative().optional(),
    available: z.boolean(),
  })
  ```
- Price input in the form is entered in dollars; converted to integer cents
  before validation/persist. Blank price → `undefined` (not `0`).

## Total computation (`src/app/order/[boothId]/actions.ts`)

`total_cents = sum(items.map(i => (i.price_cents ?? 0) * i.quantity))`.
Replace any logic that assumes a required price.

A helper `orderHasPricing(items)` = `items.some(i => i.price_cents != null)`
drives whether money is shown. Lives in `src/lib/utils.ts` (unit-tested).

## Pages & components

All under the existing `/dashboard` layout (auth-guarded). Reuse Kraft & Ember.

- **`/dashboard/booths`** (`page.tsx`, server) — lists the vendor's booths via
  `getVendor()` + a booths query. Each: banner thumb, name, active dot,
  copy-order-link button, **Edit** link. "+ New booth" → `/dashboard/booths/new`.
  Empty state mirrors the existing ticket empty-state style.
- **`/dashboard/booths/new`** and **`/dashboard/booths/[boothId]`** — both render
  `<BoothForm>`; new passes no initial booth, edit loads the row server-side
  (404 via `notFound()` if the booth isn't the vendor's — enforced by RLS query
  returning nothing).
- **`BoothForm`** (`booth-form.tsx`, client) — name, `<ImageUploader>`, active
  toggle, `<MenuEditor>`; Save calls `saveBooth`. On success →
  `/dashboard/booths` with `router.refresh()`.
- **`MenuEditor`** (`menu-editor.tsx`, client) — controlled list of item rows
  (name, description, optional price, available toggle, remove); "+ Add item"
  appends a row with a generated `id` (`crypto.randomUUID()`).
- **`ImageUploader`** (`src/components/image-uploader.tsx`, client, **reusable**)
  — click/drop → upload to `booth-images/{vendorId}/{uuid}.{ext}` via the
  browser client → returns the public URL → preview + "remove". Validates type
  (jpeg/png/webp) and size (≤ 2 MB) client-side. Takes `vendorId`, `value`,
  `onChange`.
- **Header nav:** add a "Booths" link in `dashboard/layout.tsx` next to the
  wordmark. The layout already fetches the vendor; pass `vendorId` down to where
  the uploader needs it (uploader is rendered inside BoothForm, which receives
  `vendorId` as a prop from the server page).

## Customer-side changes (optional-price rendering)

- `order/[boothId]/page.tsx`: render the booth banner (`image_url`) above the
  name when present.
- `order-form.tsx`: items without a price show no price line; "Add" still works.
  The sticky bar shows `Place order · <total>` only when the cart has pricing,
  else just `Place order`. Cart summary hides the Total row when unpriced.
- `order/[boothId]/[orderNumber]/page.tsx` and `order-card.tsx`: hide per-line
  prices and the Total row when `!orderHasPricing(items)`.

## Server action — `saveBooth` (`/dashboard/booths/actions.ts`)

```
saveBooth(input): { success: true, boothId } | { success: false, error }
```

1. Zod-validate with `boothFormSchema`.
2. `createServerClient()`; `getUser()`; reject if unauthenticated.
3. If `boothId` present → `update booths set name, image_url, is_active,
menu_items where id = boothId` (RLS scopes to owner; affected-rows 0 ⇒ error).
   Else → `insert` with `vendor_id = user.id` returning `id`.
4. Return `{ success, boothId }`.

RLS — not app code — enforces ownership.

## Testing

- **Unit (Vitest):** `boothFormSchema` (valid, missing name, price optional,
  blank vs 0), `menuItemSchema` optional price, `orderHasPricing` true/false.
- **No mock infra** for Supabase units (consistent with existing repo policy) —
  `saveBooth`, uploader, and pages are verified by `pnpm build` + manual flow.
- **Manual flow:** edit seeded "Test Stall" (rename, add banner, add a priced +
  an unpriced item, save) → verify DB row → open customer page (banner shows,
  unpriced item has no price, total reflects only priced items) → place a
  queue-only order (no total anywhere) and a priced order (total shows) → both
  land live on the dashboard.

## Out of scope

Per-item photos, menu reordering, hard delete, multi-currency, booth analytics,
QR image rendering on the manage page (order link copy is enough for now).
