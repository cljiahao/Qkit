# Round 2 — Per-item menu photos, mobile optimization, coffee-cart seed

Date: 2026-06-09
Status: Approved (pending spec review)

## Goal

Three related enhancements to QKit, shipped as one spec:

1. **Per-item menu photos** — menu items can carry an optional image, shown to
   customers and editable by vendors.
2. **Mobile optimization** — every surface (vendor + customer) reads well on a
   phone. Dashboard side was built desktop-first; fix it.
3. **Coffee-cart seed** — a second seeded booth ("Kopitiam Cart") serving
   Singapore coffee, with authored ingredient-style SVG art per drink. Exercises
   the per-item photo feature end to end.

## Non-goals

- No image generation pipeline (no photos generated). Seed art is hand-authored SVG.
- No `dangerouslyAllowSVG` global flag. SVGs render via `next/image` with
  `unoptimized` per-image when `src` ends in `.svg`.
- No external image CDN whitelisting. Seed art is same-origin under `/public`.
- No structural rewrites for mobile — Tailwind responsive prefixes only.
- Receipts / order-status pages stay text-only (no thumbnails) to keep the
  ticket clean.

## A. Per-item menu photos

### Data model

- `MenuItem` (`src/lib/types.ts`) gains `image_url?: string | null`.
- `menuItemSchema` (read boundary) and `menuItemFormSchema` (write boundary)
  gain `image_url`.
- **Validation nuance:** the booth banner uses `z.string().url()`, but seed art
  lives at relative `/public` paths (e.g. `/seed/kopi-o.svg`) which `.url()`
  rejects. Menu-item `image_url` therefore validates loosely as a string that is
  either an absolute `http(s)` URL **or** begins with `/`, nullable + optional:

  ```ts
  const menuImageUrl = z
    .string()
    .refine((s) => /^https?:\/\//.test(s) || s.startsWith("/"), {
      message: "Must be a URL or a local path",
    })
    .nullable()
    .optional();
  ```

  Stored JSONB read schema is tolerant (drops malformed entries, as today).

### Editor (`src/app/dashboard/booths/menu-editor.tsx`)

- Each menu row gets a small square photo slot.
- Reuse `ImageUploader` via a new `variant?: "banner" | "thumb"` prop:
  - `banner` (default) — current `h-40` full-width, label "Add a booth banner".
  - `thumb` — `size-20` square, terser label.
- Upload path, MIME/size validation, and storage RLS are unchanged — uploads
  still land in `booth-images/{vendorId}/{uuid}.{ext}`.
- Row state + `addItem` default include `image_url: null`.

### Customer view (`src/app/order/[boothId]/order-form.tsx`)

- New `ItemImage` component (`src/components/item-image.tsx`):
  - Wraps `next/image`; sets `unoptimized` when `src` ends in `.svg`.
  - Renders a square thumbnail with `object-cover`, rounded corners.
  - Renders nothing when `image_url` is null/empty.
- Each menu row shows a leading thumbnail when the item has `image_url`.
- Receipts (`[orderNumber]/page.tsx`) and `order-card.tsx` stay text-only.

## B. Mobile optimization (all surfaces)

Audit-and-fix pass. Tailwind responsive prefixes; mobile is the default, larger
breakpoints layer on. Surfaces:

- **Dashboard realtime order board** (`realtime-order-board.tsx`,
  `order-card.tsx`) — columns stack to a single column on phone; cards
  full-width and thumb-reachable.
- **Booth list** (`booth-list.tsx`) — grid collapses to 1 column on mobile.
- **Booth form + menu editor** (`booth-form.tsx`, `menu-editor.tsx`) — rows wrap
  cleanly; inputs + buttons sized for thumbs; new photo slot fits.
- **Dashboard header nav** (`dashboard/layout.tsx`) — collapses / wraps on
  narrow screens.
- **Login + onboarding** (`(auth)/login/page.tsx`, `onboarding-form.tsx`) —
  verify Google button, email/password, stall-name step; minor tweaks.
- **Customer pages** — re-audit menu/cart/status now that thumbnails change row
  height.

## C. Coffee-cart seed

### Booth ownership

- Attach the new booth to the **existing "Test" vendor**
  (id `6df824a1-9da2-4608-ad13-2400a9114ec0`) as a _second_ booth. Avoids faking
  an `auth.users` row (`vendors.id` is FK to `auth.users.id`).
- Booth: "Kopitiam Cart", `is_active = true`, priced (payment booth — exercises
  SGD price rendering).

### Menu (~7 items, realistic kopitiam prices, SGD)

| Item   | Ingredients (shown in art)       | Price |
| ------ | -------------------------------- | ----- |
| Kopi O | Coffee + sugar                   | $1.40 |
| Kopi   | Coffee + condensed milk          | $1.60 |
| Kopi C | Coffee + evaporated milk + sugar | $1.70 |
| Teh    | Tea + condensed milk             | $1.60 |
| Teh O  | Tea + sugar                      | $1.40 |
| Teh C  | Tea + evaporated milk + sugar    | $1.70 |
| Milo   | Malt + condensed milk            | $2.00 |

(Final prices may be tuned; intent is realistic.)

### Art (hand-authored SVG, `/public/seed/`)

- One **ingredient-style cup SVG per drink** — kopitiam-chart aesthetic:
  the cup shows readable ingredient layers / labels (coffee vs tea base,
  condensed vs evaporated milk, sugar, malt) so you can tell what's in each, the
  way the classic Singapore kopi chart depicts the recipes. Not just a flat
  colored cup.
- One **wide banner SVG** (`/seed/kopitiam-chart.svg`) — the full ingredient
  chart grid; used as the booth `image_url`.
- Each menu item's `image_url` points to its cup SVG.

### Delivery

- `supabase/seed/coffee-cart.sql` — a single idempotent-ish INSERT (guard with
  a fixed booth UUID + `on conflict do nothing` or delete-then-insert) run
  manually via `docker exec ... psql` (same method used for Test Stall). Does
  **not** touch existing data; never run `db reset`.

## Testing

- **Schema tests** (`src/lib/schemas.test.ts`): menu-item `image_url` accepts a
  bucket URL, a relative `/seed/...` path, and `null`; rejects a bare
  non-URL/non-path string.
- **Manual:** coffee booth order page renders ingredient thumbnails; dashboard
  legible at 375px width.
- `pnpm check` and `pnpm test` green.

## Files touched

- `src/lib/types.ts` — `MenuItem.image_url`
- `src/lib/schemas.ts` — `image_url` on read + form schemas, `menuImageUrl` validator
- `src/components/image-uploader.tsx` — `variant` prop
- `src/components/item-image.tsx` — **new**, svg-aware thumbnail
- `src/app/dashboard/booths/menu-editor.tsx` — per-row photo slot
- `src/app/order/[boothId]/order-form.tsx` — leading thumbnails
- Mobile: `realtime-order-board.tsx`, `order-card.tsx`, `dashboard/layout.tsx`,
  `booths/booth-list.tsx`, `booths/booth-form.tsx`, `(auth)/login/page.tsx`,
  `onboarding-form.tsx`
- `public/seed/*.svg` — **new** authored art (per-drink cups + chart banner)
- `supabase/seed/coffee-cart.sql` — **new**, manual seed
- `src/lib/schemas.test.ts` — `image_url` cases
