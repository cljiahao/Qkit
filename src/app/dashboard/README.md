# dashboard

## Purpose

The authenticated vendor area — live order board plus sub-routes for booth management, billing, account, board preferences, analytics, and support.

## Contents

- `booths/`
- `dashboard-nav.tsx`
- `feedback/`
- `layout.tsx`
- `order-actions.test.ts`
- `order-actions.ts`
- `page.tsx`
- `plan/`
- `profile/`
- `realtime-order-board.tsx`
- `settings/`
- `stats/`
- `tour-actions.ts`

## Connectivity

`page.tsx` renders the live order board (`realtime-order-board.tsx`); `booths/`, `plan/`, `profile/`, `settings/`, `stats/`, `feedback/` are the dashboard's sub-routes for booth management, billing, account, board preferences, analytics, and support respectively.

## Parent

[app](../README.md)
