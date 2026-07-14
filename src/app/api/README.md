# api

## Purpose

Route-handler API endpoints (as opposed to server actions, which live under `app/actions/` and each feature's own folder) — the surface other systems and external callers hit over HTTP.

## Contents

- `merqo/` — bearer-token-authenticated endpoints the sibling Merqo product calls into: usage metrics, vendor status lookup, and plan upgrade/downgrade requests.
- `v1/` — qkit's own versioned public API (currently a `sales` export endpoint under `v1/sales/summary`; see its own README).

## Connectivity

`merqo/` is a machine-to-machine integration surface, secured by a shared-secret `Authorization: Bearer` header checked with a constant-time comparison (`timingSafeEqual`) in each route — there is no session/cookie auth here, unlike the rest of the app. `v1/` is qkit's own external API, versioned separately from `merqo/`.

## Parent

[app](../README.md)
