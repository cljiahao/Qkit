# v1

## Purpose

Tests for `src/app/api/v1/` — qkit's stable, versioned external API surface
(the frozen contract sibling products and exports are meant to keep working
against across internal refactors).

## Contents

- `sales/` — tests for `src/app/api/v1/sales/` (the sales-summary export
  route); see its own README.

## Connectivity

Mirrors `src/app/api/v1/`'s structure; each subfolder here corresponds to a
route namespace under that path.

## Parent

[api](../README.md)
