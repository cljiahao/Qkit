# Cross-kit account-menu standardization: Plan placement + item order

Date: 2026-07-14

## Problem

loopkit and qkit — sibling Merqo kits, same stack, same shadcn-based nav
pattern — disagree on where "Plan" (billing/subscription) lives:

- loopkit: "Plan" is inside the account avatar dropdown.
- qkit: "Plan" is a top-level navbar tab, alongside Orders/Booths/Stats.

They also disagree on dropdown item order:

- loopkit: `Plan → Settings → Profile → (separator) → Sign out`
- qkit: `Profile → Board settings → Get help → Feedback → (separator) → Sign out`
  (qkit has no Plan item today, since it's a top-nav tab there)

User asked which pattern is correct and requested research before
standardizing.

## Research findings (two independent research passes)

**Nav placement.** Information-architecture guidance (rank primary nav by
frequency of use; keep primary nav to the small set of items used
_daily_, everything else goes to a secondary menu) and real-product
precedent (Vercel, Figma: Billing lives inside account/settings, not as
a top-level tab beside the core feature nav) both point the same
direction: billing/plan belongs in the account menu, not primary nav.
loopkit's placement matches this. qkit's is the outlier.

**Dropdown order.** Convention (shadcn's own reference patterns, and
practitioner consensus) is identity-first hierarchy, not raw frequency:
confirm who you are (**Profile**) → manage yourself/app (**Settings**)
→ manage money (**Plan/Billing**) → separator → leave (**Sign out**,
always last, always visually separated — the one place actual UX
research on destructive-action placement applies directly). loopkit's
current order (`Plan → Settings → Profile`) inverts the identity-first
principle. qkit's current order (`Profile → Board settings → ...`) is
already correct for the items it has.

**qkit's top-nav "Plan" link, investigated directly:** it carries no
special CTA styling — same `Button variant="ghost"` and active-state
treatment (`bg-primary/10 text-primary` when current) as every other
`LINKS` entry (`Orders`, `Booths`, `Stats`). It is a plain nav tab, not
a marketed "Upgrade!" element. The upgrade-CTA content (pricing cards,
"Get a pass"/"Go monthly" buttons, feature comparison table) lives
entirely on the Plan _page_ itself (`qkit/src/app/dashboard/plan/page.tsx`),
which is untouched by this change — moving the nav _link_ doesn't remove
or weaken any of that content, it just relocates the entry point.

## Decisions

- Both kits converge on the same dropdown shape:
  `Profile → Settings → Plan → (separator, then any kit-specific
secondary items) → Sign out`.
- Confirmed with the user directly: moving qkit's Plan out of top-nav
  into the dropdown is an acceptable tradeoff even though qkit has an
  active pricing funnel — the upgrade page itself doesn't change, it's
  one click further via the dropdown instead of a top-level tab (the
  same reachability model loopkit's own Pro upsell already uses).
- qkit's `LINKS` array is the single source for both desktop inline nav
  and the mobile nav panel — removing the Plan entry there fixes both
  surfaces with one change, no separate mobile-panel edit needed.
- qkit's new Plan dropdown item uses the `Wallet` icon from
  `lucide-react` — matching loopkit's existing icon choice for the same
  item, for cross-kit visual consistency beyond just structure.
- One shared spec doc (this file) is committed to **both** repos'
  `docs/superpowers/specs/` — identical content — so each repo's own
  history self-documents the decision without requiring a cross-repo
  hop. Implementation is split into two separate plans (one per repo),
  since the codebases differ and each needs its own SDD execution in
  its own working directory.

## A. loopkit — reorder the dropdown

`src/app/dashboard/dashboard-nav.tsx`: the three `DropdownMenuItem`
blocks currently appear in this order inside `DropdownMenuContent`
(after the separator following the label):

```
Plan (Wallet icon, href /dashboard/plan)
Settings (Settings icon, href /dashboard/settings)
Profile (User icon, href /dashboard/profile)
```

They are reordered to:

```
Profile (User icon, href /dashboard/profile)
Settings (Settings icon, href /dashboard/settings)
Plan (Wallet icon, href /dashboard/plan)
```

No label, icon, or href changes — this is a pure reorder of existing
JSX blocks. No change to the top-level `LINKS` array (Plan was never
there in loopkit).

## B. qkit — move Plan from top-nav into the dropdown

`qkit/src/app/dashboard/dashboard-nav.tsx`:

1. Remove `{ href: "/dashboard/plan", label: "Plan" }` from the `LINKS`
   array, leaving `Orders`, `Booths`, `Stats`.
2. Add `Wallet` to the existing `lucide-react` import list.
3. Insert a new `DropdownMenuItem` for Plan between the existing
   "Board settings" item and the "Get help" item:

```tsx
<DropdownMenuItem asChild>
  <Link href="/dashboard/plan" className="cursor-pointer">
    <Wallet className="size-4" />
    Plan
  </Link>
</DropdownMenuItem>
```

Resulting dropdown order: `Profile → Board settings → Plan → Get help →
Feedback → (separator) → Sign out`. No change to `qkit/src/app/dashboard/plan/page.tsx`
or any of its pricing/CTA content.

## Testing

- loopkit: `dashboard-nav.dom.test.tsx` (exists) gets a new assertion
  that the dropdown's item order is exactly `Profile, Settings, Plan`
  (e.g. querying all dropdown links after opening the menu and asserting
  their text order), extending — not replacing — the existing "account
  menu has Plan, Settings, Profile, Sign out" presence-only test (that
  test's title needs updating since it currently lists the items in the
  old order).
- qkit: no `dashboard-nav.dom.test.tsx` exists today (confirmed via
  glob). A new one is created, covering: `LINKS` no longer contains
  "Plan" (desktop nav and mobile panel both derive from it, so one
  assertion covers both), the account dropdown renders Plan between
  "Board settings" and "Get help", and the dropdown's overall item order
  is `Profile, Board settings, Plan, Get help, Feedback`.

## Out of scope

- Any change to either kit's actual Plan/Billing page content.
- Any change to qkit's Help/Feedback drawers or their trigger items'
  position relative to each other (only Plan's insertion point relative
  to them is in scope).
- Any change to `TierBadge`, avatar, or account-label rendering in
  either kit.
