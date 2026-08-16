# api

## Purpose

Route-handler API endpoints (as opposed to server actions, which live under `app/actions/` and each feature's own folder) — the surface other systems and external callers hit over HTTP.

## Contents

- `merqo/` — bearer-token-authenticated endpoints the sibling Merqo product calls into: usage metrics, vendor status lookup, plan upgrade/downgrade requests, and vendor push-provisioning.
- `telegram/` — the Telegram Bot API webhook for vendor order alerts (`webhook/route.ts`); see its own README.
- `v1/` — qkit's own versioned public API (currently a `sales` export endpoint under `v1/sales/summary`; see its own README).

## Connectivity

`merqo/` is a machine-to-machine integration surface, secured by a shared-secret `Authorization: Bearer` header checked with a constant-time comparison (`timingSafeEqual`) via shared helpers in `@/lib/merqo-auth` — there is no session/cookie auth here, unlike the rest of the app. Four routes (`downgrade-request`, `metrics`, `upgrade-request`, `vendor-status`) check against `MERQO_METRICS_SECRET`; `vendor-provision` is a write capability and is deliberately gated by a separate `MERQO_PROVISION_SECRET` instead. `telegram/webhook` is a THIRD kind of caller entirely — not Merqo, not a qkit client, but Telegram's own servers POSTing an `Update` — authenticated by a constant-time comparison of Telegram's own `X-Telegram-Bot-Api-Secret-Token` header against `TELEGRAM_WEBHOOK_SECRET`, registered one-time via Telegram's `setWebhook` API (see `docs/DEPLOY.md`), not a bearer header qkit issues itself. `v1/` is qkit's own external API, versioned separately from `merqo/`.

## Parent

[app](../README.md)
