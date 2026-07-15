# Booth Form Ticket Cards — Design

**Date:** 2026-07-14
**Status:** Approved, ready for plan.

## Summary

Follow-up to `2026-07-14-tablet-two-column-layout-design.md`. That pass gave
booth-form a 2-column _grid_ for its top three fields only, leaving the rest
of the form (hours, menu, payment, danger zone) as plain unstyled full-width
blocks. This pass goes further: restyle the whole booth new/edit form into
the same "ticket card" pattern already used by the profile and settings
pages — bordered `Section` cards flowing into a `md:columns-2` CSS
multi-column masonry, mobile single column. This supersedes the grid
approach from the prior spec for this one file; the grid wrapper introduced
there is removed.

The profile and settings pages' `Section` component is currently duplicated
verbatim (with one prop difference) in `profile-form.tsx` and
`settings-form.tsx`. Adding a third copy for booth-form is the trigger to
extract it into a shared component.

## Cards

Five cards, each `break-inside-avoid-column` so a card is never split across
the two columns. DOM order (also the mobile single-column stacking order):

1. **Name & photo** — icon `Store`, eyebrow "Shown to customers", title
   "Name & photo", description "Your booth's name and banner image."
   Contains: booth name input, banner `ImageUploader`. Stacked vertically
   inside the card (not side-by-side — the prior spec's 2-col grid for this
   pair is removed now that the card itself sits in a masonry column).

2. **Hours & availability** — icon `Clock`, eyebrow "When you're open",
   title "Hours & availability", description "Turn ordering on/off and set
   your hours." Contains: the existing active-toggle row, then
   `WorkingHoursEditor`.

3. **Menu** — icon `UtensilsCrossed`, eyebrow "What you sell", title "Menu",
   description "Add items customers can order." Contains: `MenuEditor`
   unchanged. Can grow arbitrarily tall as items are added — no special
   handling; user has explicitly accepted that a long menu may unbalance the
   two columns, to be visually assessed and amended later if it looks bad.

4. **Payment** — icon `Wallet`, eyebrow "How you get paid", title "Payment",
   description "Optional. Customers pay you directly; qkit never touches
   the money." Contains: `PaymentSection` with its own internal
   legend/description removed (see below — it duplicated this card's
   header).

5. **Danger zone** (edit mode only, `initial?.boothId` truthy) — kept as its
   own bespoke destructive-styled card, NOT using the shared `Section`
   component (it needs the red-tinted border/background the shared
   component doesn't have). Existing content (warning paragraph, delete
   button, confirm dialog) unchanged; just gets `break-inside-avoid-column`
   and `mb-5` added so it participates correctly in the masonry (the shared
   `Section` bakes in `mb-5` itself; this bespoke card needs the same
   spacing added by hand since the parent stops using `space-y-*` once
   cards live in a `columns-2` flow).

Save/Cancel buttons stay a plain full-width row **outside** the masonry
`<div>`, below it — single shared "Save booth" submit for the whole form,
unchanged behavior (confirmed: not adopting profile/settings' per-card
independent save, which doesn't work for the New booth page anyway — no
`boothId` exists until the first save creates the row).

## Shared `Section` component

Extract to `src/components/ticket-section.tsx`, named export `Section`:

```tsx
export function Section({
  icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ticket mb-5 break-inside-avoid-column overflow-hidden rounded-2xl border border-border px-6 py-6 shadow-[0_2px_0_0_var(--color-border)]">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <div>
          {eyebrow && (
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h2 className="font-display text-xl font-semibold leading-tight">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}
```

This is `profile-form.tsx`'s current local `Section` verbatim (the superset —
it has the optional `eyebrow` line settings-form's copy lacks). Both
`profile-form.tsx` and `settings-form.tsx` drop their local definitions and
import this one instead; call sites (`<Section icon=... title=... ...>`)
don't change. `.ticket` is a pre-existing global CSS class (`globals.css:138`,
the perforated-edge card texture) — purely decorative, no per-instance setup
needed.

## Child-component edits to avoid doubled headers

Two of the four child editors currently render their own heading and/or
border, which would visually duplicate the new outer `Section` header if
left as-is:

### `working-hours-editor.tsx`

Both return paths currently open with a `Clock` icon + "Working hours" label
row, and the Pro-locked path additionally wraps everything in its own
`rounded-xl border border-dashed border-border bg-card p-4` box (the normal
path uses `rounded-xl border border-border bg-card p-4`). Both headers and
both outer boxes are removed — the outer `Section` card now supplies the
icon, title, and border. Remaining content (Pro-lock badge + copy, or the
daily/weekly editor) renders directly, unwrapped:

Pro-locked path becomes:

```tsx
if (!entitlement.autoCloseHours) {
  return (
    <div className="space-y-2">
      <ProLock feature="auto_close_hours" label="Pro" />
      <p className="text-xs text-muted-foreground">
        Schedule open/close times so orders stop automatically, no need to flip
        the booth off by hand. Upgrade to set hours.
      </p>
    </div>
  );
}
```

Normal path's return becomes:

```tsx
return (
  <div className="space-y-3">
    {mode === "daily" ? (
      /* ...unchanged daily JSX... */
    ) : (
      /* ...unchanged weekly JSX... */
    )}
  </div>
);
```

The `Clock` import becomes unused after this and must be removed from the
file's imports (nothing else in the file references it).

### `payment-section.tsx`

The outer `<fieldset className="space-y-4">` currently opens with a
`<div className="space-y-1">` containing a `<legend>Payments</legend>` and a
description paragraph ("Optional. Attach your own payment method...") —
identical in substance to what the new outer "Payment" `Section` card now
says. That block is removed, and since there's no `<legend>` left to justify
a `<fieldset>`, the wrapper becomes a plain `<div>`:

```tsx
return (
  <div className="space-y-4">
    <div className="space-y-2.5">
      {/* ...unchanged OPTIONS.map radio cards... */}
    </div>
    {kind === "paynow" && (/* ...unchanged... */)}
    {kind === "pointer" && (/* ...unchanged... */)}
  </div>
);
```

### `menu-editor.tsx`

No changes. Its own "Menu items" field-level `<Label>` sits fine alongside
the outer "Menu" card title — same mild repetition pattern already present
in `profile-form.tsx` today (Section title "Stall name" above a field
labeled "Stall name") and accepted there.

## `booth-form.tsx` structure

```tsx
<form onSubmit={onSubmit} className="max-w-3xl space-y-8">
  <div className="md:columns-2 md:gap-5">
    <Section
      icon={<Store className="size-5" />}
      eyebrow="Shown to customers"
      title="Name & photo"
      description="Your booth's name and banner image."
    >
      {/* booth name Label+Input, banner Label+ImageUploader — stacked */}
    </Section>

    <Section
      icon={<Clock className="size-5" />}
      eyebrow="When you're open"
      title="Hours & availability"
      description="Turn ordering on/off and set your hours."
    >
      {/* existing active-toggle label/checkbox row, then <WorkingHoursEditor ... /> */}
    </Section>

    <Section
      icon={<UtensilsCrossed className="size-5" />}
      eyebrow="What you sell"
      title="Menu"
      description="Add items customers can order."
    >
      <MenuEditor
        vendorId={vendorId}
        items={items}
        onChange={setItems}
        entitlement={entitlement}
      />
    </Section>

    <Section
      icon={<Wallet className="size-5" />}
      eyebrow="How you get paid"
      title="Payment"
      description="Optional. Customers pay you directly; qkit never touches the money."
    >
      <PaymentSection
        vendorId={vendorId}
        value={payment}
        onChange={setPayment}
      />
    </Section>

    {initial?.boothId && (
      <div className="mb-5 space-y-2.5 break-inside-avoid-column rounded-xl border border-destructive/30 bg-destructive/[0.03] p-4">
        {/* unchanged: warning paragraph, delete button, AlertDialog */}
      </div>
    )}
  </div>

  <div className="flex gap-3">
    {/* unchanged: Save booth / Cancel buttons */}
  </div>
</form>
```

The `md:grid-cols-2` grid introduced by the prior spec (wrapping banner +
active toggle) is removed entirely — banner moves into the "Name & photo"
card, active toggle moves into "Hours & availability", each stacked
normally within its card.

`max-w-3xl` on the form is kept (introduced by the prior spec, still an
appropriate width for a 2-column masonry of these cards — no page-level
width wrapper exists on the booth new/edit pages the way profile/settings
have one, so booth-form keeps managing its own width).

## Out of scope

- Per-card independent save (profile/settings pattern) — explicitly not
  adopted; single "Save booth" submit stays, for the reason above.
- Any change to `saveBooth`/`deleteBooth` actions, `boothFormSchema`, or any
  other data/logic — this pass is styling/structure only.
- Handling menu-editor's unbounded height specially (e.g. a full-width
  breakout card) — considered and explicitly declined; try the plain
  masonry first, revisit only if it looks bad in practice.
- `/o/[code]` customer order page — untouched, per the prior spec.

## Testing

No test changes expected — `payment-section.dom.test.tsx` exercises
`PaymentSection`'s behavior (payment kind selection, field values), not its
removed header markup, so it should pass unchanged. No dom test exists for
`working-hours-editor.tsx`, `menu-editor.tsx`, or `booth-form.tsx` today.
Verify visually at 375px / 768px / 1024px after implementing, and confirm
`pnpm check` + full `pnpm test` pass (the payment-section test is the one
most likely to need a look if it queries by DOM structure rather than
role/label).
