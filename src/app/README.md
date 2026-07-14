# app

## Purpose

Next.js App Router tree — every page, layout, route handler, and PWA manifest file for this project.

## Contents

- `(auth)/`
- `actions/`
- `admin/`
- `api/`
- `apple-icon.tsx`
- `auth/`
- `dashboard/`
- `error.tsx`
- `global-error.tsx`
- `globals.css`
- `icon-192/`
- `icon-512/`
- `icon.tsx`
- `layout.tsx`
- `manifest.ts`
- `not-found.tsx`
- `o/`
- `onboarding/`
- `order/`
- `page.tsx`

## Connectivity

`(auth)/` is the vendor login/reset flow; `dashboard/` is the authenticated vendor area. `o/` and `order/` are the two customer-facing ordering surfaces (the current short-code entry point and the legacy booth-id route). `admin/` and `api/` are internal/ops surfaces; `actions/` holds server actions shared across routes rather than colocated with one page.

## Parent

[src](../README.md)
