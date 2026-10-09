# layout

## Purpose

App-shell pieces mounted once, in the root layout: the client providers, the
service-worker registrar and the maintenance banner.

## Contents

- `maintenance-banner.dom.test.tsx` — RTL tests for the enabled, disabled,
  and enabled-but-blank-message rendering branches.
- `maintenance-banner.tsx` — `MaintenanceBanner({ enabled, message })`:
  site-wide informational banner rendered from the root layout (never blocks
  anything underneath); renders nothing when disabled or the message is
  blank, so a stray enabled-but-empty row never shows an empty bar to every
  visitor.
- `providers.tsx` — `Providers({ children })`: app-wide client providers —
  Radix `TooltipProvider` and the `sonner` `Toaster`.
- `service-worker-registrar.tsx` — `ServiceWorkerRegistrar()`: registers
  `/sw.js` (best-effort) so ready-order notifications can use
  `registration.showNotification` (required on Android Chrome) and the app
  is installable as a PWA.

## Parent

[components](../README.md)
