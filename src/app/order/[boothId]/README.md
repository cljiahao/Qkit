# [boothId]

## Purpose

Legacy booth-id entry point; redirects to the current short-code route (`o/[code]/`) to keep old/printed QR links and reorder handoffs working.

## Contents

- `[orderNumber]/`
- `page.tsx`

## Connectivity

`page.tsx` resolves the booth's short code and redirects; `[orderNumber]/` is the live order-status page reached after an order is placed (independent of which entry route was used).

## Parent

[order](../README.md)
