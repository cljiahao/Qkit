# Tablet+ Two-Column Layout — Design

**Date:** 2026-07-14
**Status:** Approved, ready for plan.

## Summary

Vendors onboard and edit booths from tablets and desktops/MacBooks, not just
phones. Rule going forward: **mobile is single column; tablet and up (`md:`,
768px+) is two columns**, wherever a page currently forces one column at a
wider breakpoint (or not at all). This pass covers two files; the customer
order page (`/o/[code]`) is explicitly out of scope — it's a narrow
scan-and-order flow, not a settings/form page, and stays single column at
every width.

## Changes

### 1. Booth form (`src/app/dashboard/booths/booth-form.tsx`)

Shared by both `new` and edit (`[boothId]`) booth pages. Today it's one
`max-w-xl` single-column form top to bottom: name, banner, active toggle,
hours editor, menu editor, payment section, save/cancel, danger zone (edit
only).

Only the three short top fields get paired into a grid; everything else
(working hours editor, menu editor, payment section, buttons, danger zone)
is a variable-height list/editor and stays full width — pairing those in a
fixed 2-col grid risks lopsided columns as menu items or hours entries grow.

Layout, `grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-8` wrapping just the
top block:

- Row 1, full width (`md:col-span-2`): Booth name
- Row 2, paired at `md:`: Banner upload | Active toggle

Chosen over pairing name+toggle so the mobile stacking order stays exactly
what it is today (name → banner → toggle) — the grid only changes what
happens at `md:` and up, not the DOM order.

Below that block, unchanged: working hours editor, menu editor, payment
section, save/cancel buttons, danger zone (all full width, all breakpoints).

### 2. Profile page (`src/app/dashboard/profile/profile-form.tsx`)

Currently `lg:columns-2` (1024px) — a portrait tablet (768–1023px) still
gets single column, which contradicts the new rule. Change the one class to
`md:columns-2 md:gap-5`. No other change — same four ticket cards, same
order (profile icon, display name, stall name, change password).

### Out of scope

- `/o/[code]` customer order page — stays single column, all widths.
- Any other multi-column pages already using `grid-cols`/`columns` at other
  breakpoints (dashboard stats, admin, landing) — not touched by this pass.

## Testing

Existing `.dom.test.tsx` tests for both forms cover field behavior, not
layout — no test changes expected. Verify visually at 768px, 1024px, and a
phone width (375px) after implementing.
