# Mobile Sound + Notifications — Design

**Date:** 2026-06-21
**Status:** Approved (scope chosen: sound fix + service-worker notifications)
**Author:** Clarence + Claude

## Problem

The "order ready" chime and Web Notification don't work on mobile.

**Sound — root cause:** `playReadyChime()` does `new AudioContext()` on every
call. On mobile (iOS Safari, Android Chrome) a context created outside a user
gesture starts `suspended` and is silent. The gesture unlock (tap) unlocks one
context then discards it; the later "ready" chime makes a fresh, suspended
context. Also `resume()` is async but oscillators are scheduled synchronously.
And on iOS Safari the _only_ unlock gesture on the customer page ("Notify me") is
gated behind `isNotifySupported()` — false on iOS Safari — so audio is never
unlocked at all.

**Notifications — root cause:** `fireReadyNotification` uses the page-context
`new Notification()` constructor, which is **illegal on Android Chrome** (throws;
must use `ServiceWorkerRegistration.showNotification()`). There is no service
worker. iOS Safari only exposes notifications inside an installed PWA, and there
is no manifest, so that path doesn't exist either.

**Key framing:** these are **local** notifications (the tab is open and polling;
the alert fires on a status transition). This is NOT server push — no Push API,
VAPID, or backend is required. `registration.showNotification()` from the page,
via a minimal static service worker, is the whole fix.

## Plan

### 1. Sound — singleton, gesture-unlocked context (`src/lib/order-alerts.ts`)

- One module-level `AudioContext`, lazily created and reused.
- `unlockAudio()` — create + `resume()` the shared context; call from a user
  gesture (sound toggle / "Enable alerts" tap).
- `playReadyChime()` becomes async: reuse the shared context, `await resume()` if
  suspended, then schedule the two-note chime. Best-effort; silent on failure.

### 2. Notifications — static service worker + showNotification

- `public/sw.js`: minimal SW — `install` (skipWaiting), `activate`
  (clients.claim), and `notificationclick` (focus an open tab or open the order
  URL). No push/caching.
- Register `/sw.js` on mount via a tiny client `ServiceWorkerRegistrar` rendered
  in the root layout.
- `fireReadyNotification` becomes async: `navigator.serviceWorker.ready` →
  `reg.showNotification(title, { body, tag, data: { url } })`. Fallback to
  `new Notification()` only where the SW path is unavailable but the constructor
  works (desktop) — wrapped in try/catch so a throw is a silent no-op.

### 3. Installable PWA (so iOS works once added to home screen)

- `src/app/manifest.ts` (`MetadataRoute.Manifest`): name, short_name,
  `start_url: "/"`, `display: "standalone"` (required by iOS for notifications),
  theme/background from the Kraft & Ember tokens, icons.
- `src/app/icon.tsx` + `src/app/apple-icon.tsx`: brand "Q" mark via
  `ImageResponse` (no `sharp`/binary assets). Next injects the favicon, manifest
  icon, and apple-touch-icon.
- Root layout metadata: `manifest`, `appleWebApp`, and a `viewport.themeColor`.

### 4. Customer status page (`order-status-poller.tsx`)

- Always show an "Enable alerts" affordance while waiting — NOT gated solely on
  `isNotifySupported()`. On iOS Safari (no Notification API) it still unlocks
  sound + flashes the title; where notifications are supported it also requests
  permission. The tap calls `unlockAudio()` so the later chime plays.
- Await the now-async `playReadyChime` / `fireReadyNotification` (fire-and-forget
  with `void`).

### 5. Vendor board (`realtime-order-board.tsx`)

- The sound toggle already unlocks on tap — switch it to `unlockAudio()` +
  `void playReadyChime()`; new-order alert calls `void playReadyChime()`.

## Behaviour after the fix

| Surface              | Sound            | Notification                                       |
| -------------------- | ---------------- | -------------------------------------------------- |
| Android Chrome (tab) | ✅ after one tap | ✅ via SW showNotification                         |
| iOS Safari (tab)     | ✅ after one tap | ✗ platform limit → degrades to sound + title flash |
| iOS installed PWA    | ✅               | ✅ (display: standalone + granted)                 |
| Desktop              | ✅               | ✅                                                 |

## Tests

- `order-alerts.test.ts`: singleton context reused across `playReadyChime`
  calls; `unlockAudio` resumes; `fireReadyNotification` prefers the SW path and
  swallows failures. (jsdom mocks for `AudioContext`, `navigator.serviceWorker`,
  `Notification`.)
- `order-status-poller.dom.test.tsx`: the alert affordance shows on a page with
  no Notification API; await the async alert calls.

## Out of scope (YAGNI)

- Server push / Push API / VAPID (tab is open + polling — local notifications
  suffice). Revisit only if "notify after the tab is closed" is needed.
- Offline caching / Serwist / `next-pwa` (would force webpack; not needed).

## Risks

- **iOS in-tab still has no notifications** — platform limit, not fixable without
  install. Mitigated by the sound + title-flash fallback.
- **SW scope/caching staleness** — the SW does no caching, so no stale-asset risk;
  `clients.claim()` + `skipWaiting()` keep it current.
