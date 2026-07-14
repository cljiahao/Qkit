# booths

## Purpose

Vendor booth list, create/edit form, and printable QR code.

## Contents

- `[boothId]/`
- `actions.test.ts`
- `actions.ts`
- `booth-form.tsx`
- `booth-list.tsx`
- `menu-editor.tsx`
- `new/`
- `option-groups-editor.tsx`
- `page.tsx`
- `payment-section.dom.test.tsx`
- `payment-section.tsx`
- `working-hours-editor.tsx`

## Connectivity

`page.tsx` lists booths (`booth-list.tsx`); `new/` and `[boothId]/` both render the shared `booth-form.tsx` (create vs. edit) built from `menu-editor.tsx`, `option-groups-editor.tsx`, `working-hours-editor.tsx`, and `payment-section.tsx`.

## Parent

[dashboard](../README.md)
