# Booth QR poster — design

Date: 2026-06-11

## Problem

Vendors have no way to generate a QR code for a booth to print and display at an
event. The QR must open that booth's customer order page (`/order/[boothId]`).

## Decisions (from brainstorming)

- **Dedicated printable page** `/dashboard/booths/[boothId]/qr` (reached from a
  "QR" button on each booth card).
- Download as **PNG**.
- Poster shows: booth **name**, **"Scan to order"** CTA, and the **order URL as
  text**. No banner image.
- Booth may be inactive: **warn but still show the QR**.
- `react-qr-code` (already a dependency, currently unused) renders the QR.

## Architecture

### Route — `src/app/dashboard/booths/[boothId]/qr/page.tsx` (server)

- `params` is async (Next 16).
- `getVendor()` → redirect `/login` / `/onboarding` as siblings do.
- Fetch booth `(id, name, is_active)` with `.eq("id", boothId).maybeSingle()`.
  RLS scopes to the vendor's own booths; a foreign/missing id → `notFound()`.
- Render `<BoothQrPoster boothId name isActive />`.

### Poster — `qr/booth-qr-poster.tsx` (client)

- Order URL = `window.location.origin + "/order/" + boothId`, matching the
  existing Copy-link button (no reliable `NEXT_PUBLIC_BASE_URL`; it is unused).
- `origin` is only known client-side, so hold it in state set after mount; until
  set, render a placeholder (so SSR and first client render agree, no hydration
  mismatch).
- `react-qr-code` default export renders an `<svg>`; wrap it in a ref'd container
  to grab the node for PNG export.
- Layout (centered card): booth **name** (display font) · **QR** (~256px on
  screen) · **"Scan to order"** CTA · **order URL** (mono, wraps) · **inactive
  notice** when `!isActive` ("This booth is off — customers can't order yet").
- Buttons, all `print:hidden`: **Print** (`window.print()`), **Download PNG**,
  **Back** (`router.push("/dashboard/booths")`).

### PNG export

Pure-client, no new deps:

1. Read the rendered `<svg>` from the ref; `new XMLSerializer().serializeToString`.
2. Build a `data:image/svg+xml` URL; load into an `Image`.
3. Draw onto a 1024×1024 `<canvas>` filled white first (QR needs opaque bg).
4. `canvas.toBlob` → object URL → click a temporary `<a download>` named
   `${slug(name)}-qr.png`.

Guard: if the svg ref is null, no-op.

### Print CSS

- Add `print:hidden` to the dashboard `<header>` in `layout.tsx` (hides nav when
  printing any dashboard page — acceptable, the poster is the only print target).
- Poster buttons carry `print:hidden`.
- The poster card itself prints centered with default page styling. No global CSS
  changes required.

### Entry point — `booth-list.tsx`

Add a **QR** button (lucide `QrCode`) next to Edit/Copy, linking to
`/dashboard/booths/${booth.id}/qr`.

## Files

- `src/app/dashboard/booths/[boothId]/qr/page.tsx` (new)
- `src/app/dashboard/booths/[boothId]/qr/booth-qr-poster.tsx` (new)
- `src/app/dashboard/booths/booth-list.tsx` (QR button)
- `src/app/dashboard/layout.tsx` (`print:hidden` on header)

## Testing

No new pure logic worth a unit test (QR render + canvas are DOM-bound). Rely on:

- `pnpm check` 0, existing tests still pass, `pnpm build` clean.
- Manual: open a booth's QR page, scan with a phone → lands on the order page;
  Download PNG opens a scannable image; Print shows only the poster; inactive
  booth shows the notice.

## Out of scope

Bulk "all booths" QR sheet, custom poster themes, SVG download, embedding the
booth banner.
