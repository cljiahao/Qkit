# public

## Purpose

Static assets served as-is by Next.js from the site root.

## Contents

- `seed/` — placeholder menu-item images used by the demo/seed booth data.
- `sw.js` — the app's service worker. It caches nothing (no offline/stale-asset risk); its only jobs are (a) `self.clients.claim()` on `activate` so already-open tabs are controlled without a reload (needed before `registration.showNotification` can fire), and (b) on `notificationclick`, close the notification and focus an already-open tab or `openWindow` the order URL carried in the notification's `data.url`.

## Connectivity

`seed/` images are referenced by `supabase/seed/*.sql` seed data and rendered in the menu UI. `sw.js` is registered by `ServiceWorkerRegistrar` (`src/components/service-worker-registrar.tsx`), which gates real notifications (`Android Chrome` only allows `registration.showNotification`, not the page-level `Notification` constructor).

## Parent

[qkit](../README.md)
