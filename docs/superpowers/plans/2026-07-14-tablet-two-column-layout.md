# Tablet+ Two-Column Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make booth new/edit pages and the profile page switch to two columns at `md:` (768px, tablet portrait) and up, single column on mobile only.

**Architecture:** Pure Tailwind class changes in two existing client components — no new files, no schema, no test changes (layout, not behavior). `booth-form.tsx` gets its top three fields (name, banner, active toggle) wrapped in a `grid grid-cols-1 md:grid-cols-2` block; everything else in that form stays full width. `profile-form.tsx` changes its `lg:columns-2` wrapper to `md:columns-2`.

**Tech Stack:** Next.js 16, Tailwind v4, TypeScript strict.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- No new tests required — existing `.dom.test.tsx` suites cover field behavior, not layout, and must still pass unchanged.
- `/o/[code]` customer order page is out of scope — do not touch it.
- Verify visually at 375px (phone), 768px (portrait tablet), and 1024px+ (landscape tablet/desktop) after each task, per `docs/superpowers/specs/2026-07-14-tablet-two-column-layout-design.md`.

---

### Task 1: Booth form — pair banner + active toggle at `md:`

**Files:**

- Modify: `src/app/dashboard/booths/booth-form.tsx:115-157`
- Test: `src/app/dashboard/booths/booth-form.dom.test.tsx` (if it doesn't exist, skip creating one — this is a layout-only change; run whatever booth-form tests already exist to confirm no regression)

**Interfaces:**

- Consumes: existing local state `name`, `imageUrl`, `isActive` and their setters, already defined in this component — no signature changes.
- Produces: no new exports; the JSX structure inside the returned `<form>` changes from three stacked blocks to a grid-wrapped pair plus one full-width row. No later task depends on new names.

- [ ] **Step 1: Check for an existing dom test on this file**

Run: `ls src/app/dashboard/booths/*.dom.test.tsx` (or `find src/app/dashboard/booths -name "*.dom.test.tsx"`)

If `booth-form.dom.test.tsx` exists, open it and confirm it queries fields by label/role (e.g. `getByLabelText("Booth name")`) rather than by DOM position/order — that's what would break from this reorder. If it queries by position, note it; you'll re-run it in Step 4 either way.

- [ ] **Step 2: Replace the top three fields with the grid layout**

Current code (`booth-form.tsx:115-157`):

```tsx
  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-8">
      <div className="space-y-2.5">
        <Label
          htmlFor="booth-name"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Booth name
        </Label>
        <Input
          id="booth-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mama's Kitchen"
          className="h-12 rounded-xl text-base"
        />
      </div>

      <div className="space-y-2.5">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Banner
        </Label>
        <ImageUploader
          vendorId={vendorId}
          value={imageUrl}
          onChange={setImageUrl}
        />
      </div>

      <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="size-4 accent-[var(--color-primary)]"
        />
        <span className="text-sm">
          <span className="font-medium">Active</span>
          <span className="block text-muted-foreground">
            Customers can only order from active booths.
          </span>
        </span>
      </label>
```

Replace with:

```tsx
  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-8">
      <div className="space-y-2.5">
        <Label
          htmlFor="booth-name"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Booth name
        </Label>
        <Input
          id="booth-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mama's Kitchen"
          className="h-12 rounded-xl text-base"
        />
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-x-5">
        <div className="space-y-2.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Banner
          </Label>
          <ImageUploader
            vendorId={vendorId}
            value={imageUrl}
            onChange={setImageUrl}
          />
        </div>

        <label className="flex items-center gap-3 self-start rounded-xl border border-border bg-card px-4 py-3">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4 accent-[var(--color-primary)]"
          />
          <span className="text-sm">
            <span className="font-medium">Active</span>
            <span className="block text-muted-foreground">
              Customers can only order from active booths.
            </span>
          </span>
        </label>
      </div>
```

Notes on this diff:

- `max-w-xl` (36rem) → `max-w-3xl` (48rem) on the `<form>` — the old cap is too narrow for a two-column row to read as intentional rather than cramped. Everything below this block (hours editor, menu editor, payment section, buttons, danger zone) already renders full width inside whatever the form's max width is, so this one change widens the whole page consistently — check Step 5 that those sections still look fine at the new width (they're all `space-y-*`/full-width blocks already, so they will).
- `self-start` on the toggle `<label>` stops it stretching to match the banner uploader's height in the grid row.
- Do not touch anything from the working-hours editor onward (`booth-form.tsx:159` onward stays exactly as-is).

- [ ] **Step 3: Typecheck**

Run: `pnpm check`
Expected: no new errors (this is a JSX/class-only change, `tsc`/eslint/prettier should pass same as before).

- [ ] **Step 4: Run existing tests for this area**

Run: `pnpm test -- booth`
Expected: all existing booth-related tests still PASS (field behavior, save/delete logic — untouched). If `booth-form.dom.test.tsx` doesn't exist, this just confirms `booth-list.tsx`/`actions.test.ts` etc. are unaffected.

- [ ] **Step 5: Visual check**

Run: `pnpm dev`, open `/dashboard/booths/new` (or an existing booth's edit page) in a browser, resize to 375px / 768px / 1024px. Confirm: single column at 375px (name, then banner, then toggle, stacked); banner and toggle side by side at 768px+; hours/menu/payment/buttons/danger zone all still full width at every size.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/booths/booth-form.tsx
git commit -m "feat(booth-form): pair banner and active toggle at md: breakpoint"
```

---

### Task 2: Profile page — drop breakpoint from `lg:` to `md:`

**Files:**

- Modify: `src/app/dashboard/profile/profile-form.tsx:171`

**Interfaces:**

- Consumes: nothing new — same four `<Section>` cards already in the file, same order (Profile icon, Display name, Stall name, Change password).
- Produces: nothing new — single class-string change, no new names for later tasks.

- [ ] **Step 1: Change the breakpoint**

Current (`profile-form.tsx:171`):

```tsx
    <div className="lg:columns-2 lg:gap-5">
```

Replace with:

```tsx
    <div className="md:columns-2 md:gap-5">
```

- [ ] **Step 2: Typecheck**

Run: `pnpm check`
Expected: no new errors.

- [ ] **Step 3: Run existing profile tests**

Run: `pnpm test -- profile`
Expected: all existing profile-form tests still PASS (this file has no `.dom.test.tsx` today per the earlier grep of this session — if `pnpm test -- profile` reports "no test files found", that's expected; just confirm no failures).

- [ ] **Step 4: Visual check**

Run: `pnpm dev` (if not already running from Task 1), open `/dashboard/profile`, resize to 375px / 768px / 1024px. Confirm: single column at 375px; two columns at 768px and 1024px (previously 768px was still single column — this is the behavior change); card grouping stays profile icon+display name / stall name+password (per the last session's reorder), heights still reasonably balanced.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/profile/profile-form.tsx
git commit -m "fix(profile): switch two-column breakpoint from lg: to md:"
```

---

### Task 3: Push

**Files:** none (git operation only)

- [ ] **Step 1: Push both commits**

Run: `git push`
Expected: both commits from Tasks 1–2 land on `origin/main`.
