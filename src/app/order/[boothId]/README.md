# [boothId]

## Purpose

Legacy booth-id entry point; redirects to the current short-code route
(`o/[code]/`) to keep old/printed QR links and the reorder handoff working.

## Contents

- `page.tsx` — `OrderBoothRedirect` (route entry): validates `boothId` as a
  UUID (`notFound()` otherwise), looks up the booth's `short_code` via the
  **service client** (the customer is anonymous and anon cannot read
  `booths` directly), then `redirect("/o/" + short_code)`. `notFound()` if
  the booth has no short code.
- `[orderNumber]/` — the live customer order-status page, reached after an
  order is placed (independent of which entry route — `/order/{boothId}` or
  `/o/{code}` — the customer used). See its own README.

## Connectivity

Three callers only know a booth id rather than its short code: the
`ReorderButton` (`@/components/reorder-button.tsx`), the order-status page's
"Order again" link, and any legacy/printed `/order/{boothId}` URL. `page.tsx`
resolves the short code and redirects to `/o/{short_code}`, where `OrderForm`
picks up the reorder handoff stashed in sessionStorage. `[orderNumber]/` is
linked to directly by `placeOrder`'s result regardless of entry route.

## Parent

[order](../README.md)
