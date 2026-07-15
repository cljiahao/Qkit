# Booth Form Ticket Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the booth new/edit form into the same bordered "ticket card" pattern used by the profile and settings pages, flowing into a `md:columns-2` masonry (mobile single column), replacing the plain unstyled full-width blocks it uses today.

**Architecture:** Extract the `Section` card component (currently duplicated in `profile-form.tsx` and `settings-form.tsx`) into a shared `src/components/ticket-section.tsx`. Strip the duplicate headers/borders `working-hours-editor.tsx` and `payment-section.tsx` render internally (they'd otherwise double up with the new outer card header). Restructure `booth-form.tsx` into 5 `Section` cards inside one `md:columns-2` wrapper. Pure styling/structure — no schema, action, or save-behavior changes.

**Tech Stack:** Next.js 16, Tailwind v4, TypeScript strict, React.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Single shared "Save booth" submit for the whole form stays exactly as-is — do not split into per-card saves (the New booth page has no `boothId` until the first save creates the row, so per-card independent save can't work there).
- No changes to `saveBooth`/`deleteBooth` actions, `boothFormSchema`, or any other data/logic — styling/structure only.
- `menu-editor.tsx` gets no code changes.
- No special handling for menu-editor's unbounded height (e.g. a full-width breakout) — masonry applies to all 5 cards uniformly; already discussed and declined.
- `/o/[code]` customer order page stays untouched.
- Verify visually at 375px / 768px / 1024px after Task 4, per `docs/superpowers/specs/2026-07-14-booth-form-ticket-cards-design.md`.

---

### Task 1: Extract shared `Section` component, migrate profile + settings pages

**Files:**

- Create: `src/components/ticket-section.tsx`
- Modify: `src/app/dashboard/profile/profile-form.tsx:1-64`
- Modify: `src/app/dashboard/settings/settings-form.tsx:1-61`

**Interfaces:**

- Produces: `export function Section({ icon, eyebrow, title, description, children })` from `src/components/ticket-section.tsx`, where `icon: React.ReactNode`, `eyebrow?: string` (optional), `title: string`, `description: string`, `children: React.ReactNode`. Task 4 imports this same `Section` for booth-form's cards.
- Consumes: nothing new — both call sites already invoke `<Section icon=... title=... description=...>` (profile also passes `eyebrow`); call-site JSX doesn't change, only the import source does.

- [ ] **Step 1: Create the shared component**

Write `src/components/ticket-section.tsx`:

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

This has no `"use client"` directive — it's a pure presentational component with no hooks/state, and both call sites are already client components, so it works either as a client or server-rendered child. Don't add `"use client"`.

- [ ] **Step 2: Migrate `profile-form.tsx`**

Current (`profile-form.tsx:1-64`):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Store, IdCard, KeyRound, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/image-uploader";
import { createClient } from "@/lib/supabase/client";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
  profileNameSchema,
  displayNameSchema,
  passwordChangeSchema,
} from "@/lib/schemas";
import { FORM_ERROR_CLASS, FORM_LABEL_CLASS } from "@/lib/utils";
import { updateStallName } from "./actions";

interface Props {
  stallName: string;
  displayName: string;
  email: string;
  vendorId: string;
  avatarUrl: string | null;
}

/** Small ticket-card wrapper for one independently-saved profile section. */
function Section({
  icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  eyebrow: string;
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
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {eyebrow}
          </p>
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

export function ProfileForm({
```

Replace with:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Store, IdCard, KeyRound, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/image-uploader";
import { Section } from "@/components/ticket-section";
import { createClient } from "@/lib/supabase/client";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
  profileNameSchema,
  displayNameSchema,
  passwordChangeSchema,
} from "@/lib/schemas";
import { FORM_ERROR_CLASS, FORM_LABEL_CLASS } from "@/lib/utils";
import { updateStallName } from "./actions";

interface Props {
  stallName: string;
  displayName: string;
  email: string;
  vendorId: string;
  avatarUrl: string | null;
}

export function ProfileForm({
```

Nothing else in this file changes — every `<Section ...>` usage further down stays exactly as it is; only its import source moved.

- [ ] **Step 3: Migrate `settings-form.tsx`**

Current (`settings-form.tsx:1-61`):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, Clock, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAsyncAction } from "@/hooks/use-async-action";
import { boardSettingsSchema } from "@/lib/schemas";
import {
  isNotifySupported,
  notifyPermission,
  playSound,
  requestNotifyPermission,
  unlockAudio,
} from "@/lib/order-alerts";
import { cn, FORM_ERROR_CLASS, FORM_LABEL_CLASS } from "@/lib/utils";
import type { BoardSettings, SoundId } from "@/lib/types";
import { updateBoardSettings } from "./actions";

const SOUND_OPTIONS: { id: SoundId; label: string }[] = [
  { id: "chime", label: "Chime" },
  { id: "bell", label: "Bell" },
  { id: "ding", label: "Ding" },
  { id: "horn", label: "Horn" },
  { id: "triple", label: "Triple beep" },
  { id: "none", label: "Off" },
];

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
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

export function SettingsForm({ initial }: { initial: BoardSettings }) {
```

Replace with:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, Clock, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ticket-section";
import { useAsyncAction } from "@/hooks/use-async-action";
import { boardSettingsSchema } from "@/lib/schemas";
import {
  isNotifySupported,
  notifyPermission,
  playSound,
  requestNotifyPermission,
  unlockAudio,
} from "@/lib/order-alerts";
import { cn, FORM_ERROR_CLASS, FORM_LABEL_CLASS } from "@/lib/utils";
import type { BoardSettings, SoundId } from "@/lib/types";
import { updateBoardSettings } from "./actions";

const SOUND_OPTIONS: { id: SoundId; label: string }[] = [
  { id: "chime", label: "Chime" },
  { id: "bell", label: "Bell" },
  { id: "ding", label: "Ding" },
  { id: "horn", label: "Horn" },
  { id: "triple", label: "Triple beep" },
  { id: "none", label: "Off" },
];

export function SettingsForm({ initial }: { initial: BoardSettings }) {
```

Nothing else in this file changes — every `<Section ...>` usage further down (none of which pass `eyebrow`) stays exactly as it is.

- [ ] **Step 4: Typecheck**

Run: `pnpm check`
Expected: no new errors. In particular, confirm no "unused import" or "missing prop" errors — `Section`'s `eyebrow` is now optional so settings-form's calls (which never pass it) still type-check.

- [ ] **Step 5: Run existing tests**

Run: `pnpm test -- profile settings`
Expected: all existing tests pass unchanged, including `src/app/dashboard/settings/settings-form.dom.test.tsx` (5 tests) — this is a pure refactor with zero visible/behavioral change, so nothing should differ.

- [ ] **Step 6: Visual check**

Run: `pnpm dev`, open `/dashboard/profile` and `/dashboard/settings`. Confirm both render pixel-identical to before this task (same cards, same text, same layout) — this step is a no-op refactor, so any visible difference is a bug.

- [ ] **Step 7: Commit**

```bash
git add src/components/ticket-section.tsx src/app/dashboard/profile/profile-form.tsx src/app/dashboard/settings/settings-form.tsx
git commit -m "refactor: extract shared ticket Section component from profile/settings forms"
```

---

### Task 2: Strip the duplicate header from `working-hours-editor.tsx`

**Files:**

- Modify: `src/app/dashboard/booths/working-hours-editor.tsx:1-16` (imports), `:54-70` (Pro-locked return), `:98-104` (main return opening)

**Interfaces:**

- Consumes: nothing new.
- Produces: `WorkingHoursEditor`'s exported signature (`{ value, onChange, entitlement }` props, same return type `JSX.Element`) is unchanged — only its internal rendering loses the icon+label header and the outer bordered box in both branches. Task 4 renders this component inside a `Section` card that now supplies the header/border instead.

- [ ] **Step 1: Remove the unused `Clock` import**

Current (`working-hours-editor.tsx:1-9`):

```tsx
"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProLock } from "@/components/pro-lock";
import type { Entitlement } from "@/lib/plan";
import type { WeekdayKey } from "@/lib/tz";
import type { BoothHours, DayWindow } from "@/lib/hours";
```

Replace with:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ProLock } from "@/components/pro-lock";
import type { Entitlement } from "@/lib/plan";
import type { WeekdayKey } from "@/lib/tz";
import type { BoothHours, DayWindow } from "@/lib/hours";
```

- [ ] **Step 2: Simplify the Pro-locked return path**

Current (`working-hours-editor.tsx:54-70` in the original file, before Step 1's import removal shifts line numbers):

```tsx
if (!entitlement.autoCloseHours) {
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Working hours</span>
        </div>
        <ProLock feature="auto_close_hours" label="Pro" />
      </div>
      <p className="text-xs text-muted-foreground">
        Schedule open/close times so orders stop automatically, no need to flip
        the booth off by hand. Upgrade to set hours.
      </p>
    </div>
  );
}
```

Replace with:

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

- [ ] **Step 3: Simplify the main return's opening**

Current (`working-hours-editor.tsx:98-105` in the original file):

```tsx
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Clock className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Working hours</span>
      </div>

      {mode === "daily" ? (
```

Replace with:

```tsx
  return (
    <div className="space-y-3">
      {mode === "daily" ? (
```

Everything from here to the end of the file (the full daily/weekly JSX and closing tags) is unchanged — this step only touches the wrapper `<div>`'s className and deletes the header `<div>` that sat above `{mode === "daily" ? (`.

- [ ] **Step 4: Typecheck**

Run: `pnpm check`
Expected: no errors — specifically confirm no "`Clock` is defined but never used" lint error remains (Step 1 already removed it) and no other reference to `Clock` survives in this file.

- [ ] **Step 5: Run existing tests**

Run: `pnpm test -- hours`
Expected: `src/lib/hours-editor.test.ts` (10 tests) and `src/lib/hours.test.ts` (25 tests) still pass — these test the pure logic this component calls (`dailyFromWeek`, `weekFromDaily`, etc.), unaffected by markup changes. There is no `working-hours-editor.dom.test.tsx` today.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/booths/working-hours-editor.tsx
git commit -m "refactor(working-hours-editor): drop internal header, now supplied by the outer card"
```

---

### Task 3: Strip the duplicate header from `payment-section.tsx`

**Files:**

- Modify: `src/app/dashboard/booths/payment-section.tsx:82-94` (return opening), `:268-271` (return closing)

**Interfaces:**

- Consumes: nothing new.
- Produces: `PaymentSection`'s exported signature (`{ vendorId, value, onChange }` props, same return type) is unchanged — only the outer wrapper element and its header markup are removed. Task 4 renders this component inside a `Section` card that now supplies the "Payment" header instead.

- [ ] **Step 1: Remove the legend/description block, change `fieldset` to `div`**

Current (`payment-section.tsx:82-95`):

```tsx
  return (
    <fieldset className="space-y-4">
      <div className="space-y-1">
        <legend className="font-display text-lg font-semibold">Payments</legend>
        <p className="text-sm text-muted-foreground">
          Optional. Attach your own payment method, customers pay you directly;
          qkit never touches the money.
        </p>
      </div>

      {/* Radio cards: a small, comparable set, so show every option at once
          (a dropdown would hide them and add a click). */}
      <div className="space-y-2.5">
```

Replace with:

```tsx
  return (
    <div className="space-y-4">
      {/* Radio cards: a small, comparable set, so show every option at once
          (a dropdown would hide them and add a click). */}
      <div className="space-y-2.5">
```

- [ ] **Step 2: Close the `div` instead of the `fieldset`**

Current (`payment-section.tsx:268-271`):

```tsx
    </fieldset>
  );
}
```

Replace with:

```tsx
    </div>
  );
}
```

Everything between Step 1's opening and Step 2's closing (the `OPTIONS.map` radio cards and the two conditional `kind === "paynow"` / `kind === "pointer"` detail blocks) is unchanged.

- [ ] **Step 3: Typecheck**

Run: `pnpm check`
Expected: no errors.

- [ ] **Step 4: Run existing tests**

Run: `pnpm test -- payment`
Expected: `src/app/dashboard/booths/payment-section.dom.test.tsx` (5 tests) still passes unchanged — it queries by role/label (`getByRole("radio", { name: /PayNow/i })` etc.), never by the removed `<legend>` text, so removing the header doesn't affect it. Also check `src/lib/payments/*.test.ts` (adapters, paynow — 10 tests) still pass, though those test pure functions this component calls, not its markup.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/booths/payment-section.tsx
git commit -m "refactor(payment-section): drop internal header, now supplied by the outer card"
```

---

### Task 4: Restructure `booth-form.tsx` into 5 ticket cards

**Files:**

- Modify: `src/app/dashboard/booths/booth-form.tsx` (imports at `:1-34`, full return block at `:115-247`)

**Interfaces:**

- Consumes: `Section` from `@/components/ticket-section` (Task 1: `{ icon, eyebrow?, title, description, children }`), `WorkingHoursEditor` from Task 2 (same props, no header of its own now), `PaymentSection` from Task 3 (same props, no header of its own now). All local state (`name`, `imageUrl`, `isActive`, `hours`, `items`, `payment`, `saving`, `deleting`) and handlers (`onDelete`, `onSubmit`) are pre-existing in this file — no signature changes to any of them.
- Produces: no new exports — `BoothForm`'s props and behavior are identical; only its returned JSX structure changes.

- [ ] **Step 1: Update imports**

Current (`booth-form.tsx:1-34`):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ImageUploader } from "@/components/image-uploader";
import { useAsyncAction } from "@/hooks/use-async-action";
import { MenuEditor } from "./menu-editor";
import { WorkingHoursEditor } from "./working-hours-editor";
import { PaymentSection } from "./payment-section";
import { saveBooth, deleteBooth } from "./actions";
import {
  boothFormSchema,
  sanitizeOptionGroups,
  type MenuItemFormInput,
} from "@/lib/schemas";
import type { Entitlement } from "@/lib/plan";
import type { BoothHours } from "@/lib/hours";
import type { PaymentConfig } from "@/lib/types";
```

Replace with:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Store, Clock, UtensilsCrossed, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ImageUploader } from "@/components/image-uploader";
import { Section } from "@/components/ticket-section";
import { useAsyncAction } from "@/hooks/use-async-action";
import { MenuEditor } from "./menu-editor";
import { WorkingHoursEditor } from "./working-hours-editor";
import { PaymentSection } from "./payment-section";
import { saveBooth, deleteBooth } from "./actions";
import {
  boothFormSchema,
  sanitizeOptionGroups,
  type MenuItemFormInput,
} from "@/lib/schemas";
import type { Entitlement } from "@/lib/plan";
import type { BoothHours } from "@/lib/hours";
import type { PaymentConfig } from "@/lib/types";
```

- [ ] **Step 2: Replace the entire return block**

Current (`booth-form.tsx:115-247`, the full `return (...)` statement through the component's closing brace):

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

      <WorkingHoursEditor
        value={hours}
        onChange={setHours}
        entitlement={entitlement}
      />

      <MenuEditor
        vendorId={vendorId}
        items={items}
        onChange={setItems}
        entitlement={entitlement}
      />

      <PaymentSection
        vendorId={vendorId}
        value={payment}
        onChange={setPayment}
      />

      <div className="flex gap-3">
        <Button
          type="submit"
          size="lg"
          className="h-12 flex-1 rounded-xl text-base font-semibold"
          disabled={saving}
        >
          {saving ? "Saving…" : "Save booth"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 rounded-xl"
          onClick={() => router.push("/dashboard/booths")}
        >
          Cancel
        </Button>
      </div>

      {initial?.boothId && (
        <div className="space-y-2.5 rounded-xl border border-destructive/30 bg-destructive/[0.03] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
            Danger zone
          </p>
          <p className="text-sm text-muted-foreground">
            Deleting this booth permanently removes it and every order placed at
            it. The data can&apos;t be retrieved.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive hover:text-white"
                disabled={deleting || saving}
              >
                <Trash2 className="size-4" />
                {deleting ? "Deleting…" : "Delete booth"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{initial.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes the booth and every order placed at
                  it. This can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>
                  Keep booth
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDelete}
                  disabled={deleting}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Delete booth
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </form>
  );
}
```

Replace with:

```tsx
  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-8">
      <div className="md:columns-2 md:gap-5">
        <Section
          icon={<Store className="size-5" />}
          eyebrow="Shown to customers"
          title="Name & photo"
          description="Your booth's name and banner image."
        >
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
        </Section>

        <Section
          icon={<Clock className="size-5" />}
          eyebrow="When you're open"
          title="Hours & availability"
          description="Turn ordering on/off and set your hours."
        >
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

          <WorkingHoursEditor
            value={hours}
            onChange={setHours}
            entitlement={entitlement}
          />
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
            <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
              Danger zone
            </p>
            <p className="text-sm text-muted-foreground">
              Deleting this booth permanently removes it and every order
              placed at it. The data can&apos;t be retrieved.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive hover:text-white"
                  disabled={deleting || saving}
                >
                  <Trash2 className="size-4" />
                  {deleting ? "Deleting…" : "Delete booth"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{initial.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes the booth and every order placed
                    at it. This can&apos;t be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>
                    Keep booth
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    disabled={deleting}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    Delete booth
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button
          type="submit"
          size="lg"
          className="h-12 flex-1 rounded-xl text-base font-semibold"
          disabled={saving}
        >
          {saving ? "Saving…" : "Save booth"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 rounded-xl"
          onClick={() => router.push("/dashboard/booths")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
```

Key differences from the current version, so a reviewer can check intent, not just text:

- The old top-level `grid grid-cols-1 md:grid-cols-2` wrapper (from the prior tablet-layout pass) is gone entirely — replaced by the `md:columns-2 md:gap-5` masonry wrapping all cards.
- Booth name + Banner now share one `Section` ("Name & photo"); Active toggle + `WorkingHoursEditor` now share another ("Hours & availability") — previously these were three separate top-level blocks.
- The toggle `<label>` drops `self-start` (a flex/grid-only alignment utility that did nothing once it's no longer a grid item).
- Danger zone moved from after the Save/Cancel row to inside the masonry (paired near Payment), gained `mb-5 break-inside-avoid-column` so it behaves like the other masonry cards, otherwise unchanged (same warning copy, same delete button, same dialog).
- Save/Cancel buttons moved from before Danger zone to after the whole masonry `<div>` — now the last thing in the form.

- [ ] **Step 3: Typecheck**

Run: `pnpm check`
Expected: no errors.

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: full suite passes, in particular anything under `src/app/dashboard/booths/` and `src/lib/` — there's no `booth-form.dom.test.tsx` today, so this confirms no regression in adjacent code, not new coverage of this file.

- [ ] **Step 5: Visual check**

Run: `pnpm dev`, open `/dashboard/booths/new` and an existing booth's edit page. Resize to 375px / 768px / 1024px. Confirm at 375px: five (four on `/new`, no Danger zone) cards stacked in the order Name & photo → Hours & availability → Menu → Payment → (Danger zone). Confirm at 768px+: cards flow into two columns. Confirm the Save/Cancel row renders full-width below all cards. Confirm deleting a booth from the Danger zone card still works (dialog opens, confirms, deletes, redirects).

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/booths/booth-form.tsx
git commit -m "feat(booth-form): restyle into ticket cards in a md:columns-2 masonry"
```

---

### Task 5: Push

**Files:** none (git operation only)

- [ ] **Step 1: Push all four commits**

Run: `git push`
Expected: Tasks 1–4's commits land on `origin/main`.
