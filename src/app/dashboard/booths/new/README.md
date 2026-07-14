# new

## Purpose

Create-booth page — the plan-gated entry point for a vendor's first (or next) booth.

## Contents

- `page.tsx` — `NewBoothPage()` (server, `revalidate = 0`): counts the vendor's existing booths and redirects to `/dashboard/plan` if `canAddBooth(entitlement, count)` is false (RLS is the real backstop; this just avoids sending the vendor into a form that will fail to save), otherwise renders `BoothForm` (from `../booth-form`) with no `initial` data.

## Connectivity

Linked from the empty-state "Add your first booth" CTA on `realtime-order-board.tsx` and the "New booth" button on `booths/page.tsx`; renders the shared `booth-form.tsx`, which calls `saveBooth` in `../actions.ts` on submit and redirects back to `/dashboard/booths`.

## Parent

[booths](../README.md)
