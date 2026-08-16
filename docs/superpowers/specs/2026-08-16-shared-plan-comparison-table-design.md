# Shared Plan Comparison Table — Design

**Date:** 2026-08-16
**Status:** Approved; plan to follow.

## Summary

qkit's and loopkit's `/dashboard/plan` pages each hand-roll a near-identical
feature-comparison grid (fixed-width columns, a centered check/dash cell
per feature per tier) — confirmed by reading both files: same
`grid-cols-[1fr_2.75rem…]` shape, same header row, same per-row
`border-t` divider, same `Cell` check/dash helper, differing only in tier
count (qkit: Free/Pass/Pro, 3 tiers; loopkit: Free/Pro, 2 tiers, with one
row using a string value — `"1"`/`"∞"` — instead of a boolean). This
extracts that duplicated layout into one `@merqo/ui` component,
`PlanComparisonTable`.

**paykit and stockkit are explicitly out of scope.** Both were checked and
use a different, simpler pattern already — a single "your current plan"
card with a bullet list of that plan's features, no side-by-side grid at
all. Forcing them onto a comparison-table component would be a redesign
of their plan page, not an extraction of existing duplication — not what
this spec does.

## Guiding decisions

- **Tier count is a prop, not hardcoded to 2 or 3** — the grid's column
  template is computed at runtime (`gridTemplateColumns` inline style,
  `` `1fr ${tiers.map(() => "2.75rem").join(" ")}` ``), not a Tailwind
  arbitrary-value class string. A fixed set of Tailwind classes per
  possible tier count would need every consuming app's own build to
  actually contain that exact class (JIT purge risk across 4 separate
  Tailwind configs); computed inline `gridTemplateColumns` has no such
  risk and naturally supports loopkit's 2 and qkit's 3 without a variant
  prop.
- **Cell values are `boolean | string`**, not boolean-only — loopkit's
  "Loyalty programs: 1 / ∞" row needs a string cell today; qkit's rows
  are all boolean today but the type should not foreclose a future
  string cell there either.
- **The component owns only the grid**, not the pricing cards above it
  (qkit's event-pass/monthly cards, loopkit's single Pro card) — those
  differ enough in content and CTA wiring per kit that extracting them
  would cost more (prop surface complexity) than it saves (they're not
  actually duplicated the way the grid is).
- **No `Cell` sub-component exported separately** — it's an internal
  rendering detail of `PlanComparisonTable`, not a reusable primitive on
  its own.

## What changes

### `merqo-ui` repo: `src/plan-comparison-table.tsx` (new)

```tsx
export interface PlanComparisonTier {
  key: string;
  label: string;
}

export interface PlanComparisonRow {
  label: string;
  values: Record<string, boolean | string>; // keyed by tier.key
}

export interface PlanComparisonTableProps {
  tiers: PlanComparisonTier[];
  rows: PlanComparisonRow[];
}

export function PlanComparisonTable({ tiers, rows }: PlanComparisonTableProps) {
  const gridTemplateColumns = `1fr ${tiers.map(() => "2.75rem").join(" ")}`;
  // header row: "Feature" + each tier.label, style={{ gridTemplateColumns }}
  // one row per `rows` entry: row.label + each tier's cell —
  //   typeof value === "string" ? <span>{value}</span> : <Cell on={value} />
  // Cell (internal, not exported): Check icon (lucide-react, already a
  // dependency) when on, a muted dash otherwise — same visual as both
  // kits' existing local Cell today.
}
```

Exported from `src/index.ts` alongside every other shared component.
Bump `merqo-ui`'s own version (next patch/minor per its own convention —
this is a new export, so minor: `0.15.0`), tag it, same two-repo sequence
every other `@merqo/ui` change in this session has followed.

### qkit: `src/app/dashboard/plan/page.tsx`

Replace the local `FEATURES`/`Cell`/grid JSX with:

```tsx
<PlanComparisonTable
  tiers={[
    { key: "free", label: "Free" },
    { key: "pass", label: "Pass" },
    { key: "pro", label: "Pro" },
  ]}
  rows={FEATURES.map((f) => ({
    label: f.label,
    values: { free: f.free, pass: f.pass, pro: f.pro },
  }))}
/>
```

`FEATURES`'s own const array stays local to this file (it's qkit's own
feature list, not shared data) — only the _rendering_ moves to the shared
component.

### loopkit: `src/app/dashboard/plan/page.tsx`

Same shape, 2 tiers, keeping the existing string-or-boolean `FEATURES`
values unchanged (they already match the shared component's
`boolean | string` cell type without modification).

## Testing

- `merqo-ui`: `src/plan-comparison-table.test.tsx` — renders the right
  number of tier-header columns; a boolean cell renders a check/dash; a
  string cell renders as plain text; row order matches input order.
- qkit: extend the existing `plan/page` test (if one exists covering the
  comparison grid) to assert against `PlanComparisonTable`'s rendered
  output rather than the deleted local markup — same visible behavior,
  different render path.
- loopkit: same, for its own plan page test.

## Self-review

- No placeholders.
- paykit/stockkit's exclusion is stated with the actual reason (different
  existing pattern, not oversight) — not silently dropped from scope.
- The component's prop shape was checked against both real consumers'
  actual current data shapes (qkit's booleans-only rows, loopkit's mixed
  boolean/string rows) before being finalized, not designed in the
  abstract.

## Parent

[specs](README.md)
