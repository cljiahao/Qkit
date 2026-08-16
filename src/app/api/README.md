# api

## Purpose

Route-handler API endpoints (as opposed to server actions, which live under `app/actions/` and each feature's own folder) — the surface other systems and external callers hit over HTTP.

## Contents

- `merqo/` — bearer-token-authenticated endpoints the sibling Merqo product calls into: usage metrics, vendor status lookup, plan upgrade/downgrade requests, and vendor push-provisioning.
- `v1/` — qkit's own versioned public API (currently a `sales` export endpoint under `v1/sales/summary`; see its own README).

## Connectivity

`merqo/` is a machine-to-machine integration surface, secured by a shared-secret `Authorization: Bearer` header checked with a constant-time comparison (`timingSafeEqual`) via shared helpers in `@/lib/merqo-auth` — there is no session/cookie auth here, unlike the rest of the app. Four routes (`downgrade-request`, `metrics`, `upgrade-request`, `vendor-status`) check against `MERQO_METRICS_SECRET`; `vendor-provision` is a write capability and is deliberately gated by a separate `MERQO_PROVISION_SECRET` instead. `v1/` is qkit's own external API, versioned separately from `merqo/`. qkit's own Telegram bot webhook (formerly `telegram/webhook`) was retired 2026-08-16 in favor of merqo's shared bot — this repo no longer receives Telegram traffic directly; see `docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`.

## Parent

[app](../README.md)
