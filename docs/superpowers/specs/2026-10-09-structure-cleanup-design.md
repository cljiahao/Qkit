# Structure Cleanup: Shared Pieces, Local Duplicates, Folder Layout — Design

**Date:** 2026-10-09
**Status:** Approved 2026-10-09. #196 merged the same day and every finding
below was re-checked against `main` afterwards: all seven duplicates still
held, and a wider search put the em-dash count at 18 strings, not 12. Phase 1 shipped
first; Phases 2 and 3 follow as their own PRs.

## Summary

An audit of qkit against three questions: is it using `@merqo/ui` wherever
it can, does it repeat itself internally, and does its layout follow
templateCentral's Next.js standards.

The answers: shared-package adoption is complete, there are seven real
internal duplicates worth removing, and the folder layout has drifted from
the standard in ways that are cheap to fix for `src/components` and
`src/lib` and not worth fixing for `src/features`.

No behaviour changes are intended anywhere in this spec, with two stated
exceptions: the board's sort switch grows from 36px to 44px on touch
screens, and a handful of error messages lose their em dashes.

## What the audit found

Each row was first found by search, then confirmed by reading the code.

### Shared package: nothing to adopt

qkit imports 35 `@merqo/ui` exports. The 8 it does not import were checked
against `merqo-ui/docs/usage-matrix.md` and its 2026-10-09 snapshot. Each is
reached through another export (`AccountMenu`, `LegalFooterLinks`), is
replaced by a qkit-specific sibling (`DashboardTour` by `DashboardTours`),
belongs to another product (`VendorTelegramSection`), or is recorded as a
deliberate non-adoption (`qrSvg`).

One defect in the shared package surfaced during the 2026-10-09 phone pass:
`Section`'s `tooltip` is hover-only, so it cannot be opened on a touch
screen. qkit worked around it for its one call site. The fix belongs in
`merqo-ui` and is out of scope here.

### Internal duplicates: confirmed

| #   | What repeats                                                            | Where                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Segmented switch: bordered group of pills, one active                   | 4 button-based copies (`realtime-order-board.tsx`, `completed-orders-list.tsx`, `stats-controls.tsx`, `top-items.tsx`); 2 `ToggleGroup` copies in `payment-section.tsx` with the same classes |
| D2  | Page header: small-caps label, display-font title, optional description | 12 pages under `dashboard/` and `admin/`                                                                                                                                                      |
| D3  | Cart mutations: `updateCart`, `addConfigured`, `increment`, `decrement` | `order-form.tsx` and `walkup-order-dialog.tsx`, identical line for line. Only the stock check differs                                                                                         |
| D4  | Reading the `{kind}` marker on `booths.payment`                         | `paymentMarker` (`booths/actions.ts`), `initialPaymentFromMarker` (`booths/[boothId]/page.tsx`), `markerKind` (`walkup-menu-actions.ts`)                                                      |
| D5  | "First order of the day" lookup behind the daily ticket number          | Identical query in `o/[code]/notify.ts`, `order/[boothId]/display/actions.ts`, `order/[boothId]/[orderNumber]/page.tsx`                                                                       |
| D6  | `z.string().uuid()` declared as a local constant                        | 8 action and page files, while `schemas.ts` already exports `orderBoothIdSchema`                                                                                                              |
| D7  | The small-caps label class string                                       | About 20 files                                                                                                                                                                                |

### Checked and withdrawn

These were in the first audit and do not hold up.

- **`messageFor` in `o/[code]/actions.ts` and `walkup-actions.ts`.** Not a
  duplicate. They map the same error codes to different copy for different
  readers (customer, vendor) and each has cases the other lacks. A shared
  table would be more code than the two functions.
- **Payment QR rendering in `pay-form.tsx` and `walkup-pay-step.tsx`.** Only
  partly overlapping: the customer page saves the QR as an image and shows a
  payment link as a button, the walk-up step shows that link as a QR. More
  to the point, this is the piece that moves to paykit when payment concerns
  are separated from qkit. Extracting it now would be done twice.
- **Dead components.** `landing-ticket`, `payment-proof-viewer` and
  `tour-steps` have no alias importers but are all used through relative
  imports.

### Found on the way

Twelve user-facing error strings in server actions contain an em dash
(`o/[code]/actions.ts`, `payment-actions.ts`, `order-actions.ts`), for
example "Order changed — please refresh." The lint gate only covers `.tsx`,
so these slipped through.

### Layout against templateCentral (Next.js, 5.15.0)

| Standard                                  | qkit                                                                                                      | Decision                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------ |
| Harness version                           | 5.15.0, matches the plugin                                                                                | No drift                 |
| kebab-case files, named exports only      | Clean: no violations found                                                                                | Nothing to do            |
| shadcn primitives in `components/ui`      | Yes                                                                                                       | Nothing to do            |
| `components/widgets`, `components/layout` | `src/components` holds 26 files flat. `landing/` and `order/` exist, yet `landing-*.tsx` sits beside them | Fix (Phase 3)            |
| `src/lib` organised                       | 57 files flat; 9 `merqo-*`, 4 `admin*`, 4 `booth-*`                                                       | Fix (Phase 3)            |
| `src/features/<name>/`                    | Feature components live beside their routes in `src/app/**`                                               | Keep as is, see below    |
| Barrel `index.ts` per folder              | None                                                                                                      | Keep as is, see below    |
| Thin components                           | 4 files near or over 900 lines                                                                            | Follow-up, not this spec |
| Tests under `test/api/`                   | Colocated; #196 adds `test/api/`                                                                          | Leave to #196            |

## Guiding decisions

- **Extract locally, not into `@merqo/ui`, unless a second kit needs it.**
  D1 and D2 were searched for in paykit, stockkit, loopkit, merqo and
  printkit: the segmented switch appears in none, the page header in at most
  two files each. templateCentral's own rule is to extract at the second
  consumer. D7's label style does appear in every kit and is a fair
  candidate for the shared package later; it is handled here as a local
  constant only.
- **No move to `src/features/`.** The App Router already groups each
  feature's components with its routes, with a README per folder. Moving
  them is hundreds of import edits for a layout that reads no better.
  Record it as an accepted divergence.
- **No barrels.** Half of these folders mix Server and Client Components. A
  barrel that re-exports both pulls server code towards client bundles, and
  a Server Component that imports a plain value through a `"use client"`
  barrel gets a client reference instead of the value (the
  `SOCIAL_LINK_FIELDS` crash of 2026-09-18). Deep imports stay. Record it as
  an accepted divergence.
- **Recording the two divergences means editing `AGENTS.md`**, a protected
  file. That edit needs explicit approval when Phase 3 lands.
- **Moves and logic changes never share a PR.** A reviewer must be able to
  see that a move PR is only moves.
- **Each phase is one PR, merged and swept before the next starts.**

## Phase 1: small extractions (no behaviour change)

**D1 `SegmentedControl`** in `src/components/segmented-control.tsx`.

```tsx
interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  // An option outside the vendor's plan: rendered as a link with a lock.
  lockedHref?: string;
}

function SegmentedControl<T extends string>(props: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "md" | "sm";
}): JSX.Element;
```

A `role="group"` of buttons with `aria-pressed`, 44px tall on a coarse
pointer. Replaces the four button-based copies. `lockedHref` covers
`stats-controls.tsx`'s out-of-plan ranges. The two `ToggleGroup` copies in
`payment-section.tsx` keep `ToggleGroup` (they are radio inputs inside a
form and are tested as radios) and take their classes from two constants
exported by the same file. Visible change: the board's sort switch is 36px
on touch today and becomes 44px.

**D2 `PageHeader`** in `src/components/page-header.tsx`:
`PageHeader({ eyebrow, title, description?, responsive? })`. Renders only
the label, title and description. Each page keeps its own surrounding
layout (back button above, action button beside). `responsive` is the
`text-3xl sm:text-4xl` title the Booths page uses.

**D7 `EYEBROW_CLASS`** in `src/lib/utils.ts`, beside `FORM_LABEL_CLASS`.
Used by `PageHeader` and substituted only where the existing string matches
exactly.

**D4 `src/lib/payment-marker.ts`**: `paymentKindOf(data: unknown)` and
`paymentMarker(kind)`, with unit tests. The three current functions become
calls to these.

**D5 `src/lib/daily-order-number.ts`**: `firstOrderNumberToday(client,
boothId)` and `vendorFacingOrderNumber(client, vendorId, boothId,
orderNumber)` (moved out of `notify.ts`). The dashboard page's multi-booth
variant is a different query and stays.

**D6** Export one `uuidSchema` from `schemas.ts`; the 8 local constants
import it.

**Em dashes.** Reword the twelve strings, and extend the lint gate to
`error:` string properties and returned string literals in `actions.ts`
files so it cannot recur.

Acceptance: `pnpm check`, `pnpm test`, `pnpm build` green. Existing tests
for the six call sites pass unchanged apart from import paths. New tests for
`SegmentedControl`, `PageHeader`, `payment-marker`, `daily-order-number`.

## Phase 2: one cart hook

**D3 `src/hooks/use-cart.ts`.**

```ts
function useCart(options: {
  initial?: Map<string, CartItem>;
  // True when one more of this item must be refused. The caller owns the
  // message, since the two forms explain a refusal differently.
  isBlocked: (menuItemId: string, items: CartItem[]) => boolean;
}): {
  cart: Map<string, CartItem>;
  setCart: Dispatch<SetStateAction<Map<string, CartItem>>>;
  entries: [string, CartItem][];
  items: CartItem[];
  add: (item: MenuItem, options: SelectedOption[]) => void;
  increment: (key: string) => void;
  decrement: (key: string) => void;
  clear: () => void;
};
```

`order-form.tsx` passes the availability-based check, `walkup-order-dialog.tsx`
the stock-only one. `setCart` stays exposed because `order-form.tsx` trims
the basket when another customer's hold takes stock, and restores it from
storage. Which item is being customised stays in each component: it is view
state.

This is the ordering path, so it gets its own PR. Acceptance: both forms'
existing tests pass unchanged; new hook tests cover add, repeat add,
increment, decrement to zero, a blocked add and a blocked increment.

## Phase 3: folder regroup (moves only)

`src/components` (26 root files, 67 import sites):

| Folder     | Files                                                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `landing/` | `landing-board`, `landing-boards`, `landing-cta`, `landing-ticket`, `hero-preview-carousel`, `featured-booths` (joins `nav`, `footer`)                                |
| `order/`   | `item-customizer`, `allergen-badges`, `reorder-button` (joins `order-form`)                                                                                           |
| `board/`   | `order-card`, `order-status-badge`, `payment-proof-viewer`                                                                                                            |
| `tour/`    | `dashboard-tour`, `tour-steps`                                                                                                                                        |
| `layout/`  | `providers`, `service-worker-registrar`, `maintenance-banner`                                                                                                         |
| `widgets/` | `ticket`, `ticket-section`, `hint`, `paginated`, `pro-lock`, `media-image`, `zoomable-image`, `social-links-row`, `feedback-form`, `segmented-control`, `page-header` |

`src/lib` (57 root files; only the prefixed families move, about 70 import
sites):

| Folder   | Files                                                                                     |
| -------- | ----------------------------------------------------------------------------------------- |
| `merqo/` | the 9 `merqo-*` files, prefix dropped (`merqo/auth.ts`, `merqo/customer-notify.ts`, ...)  |
| `admin/` | `admin-stats`, `admin-vendor-health`, `admin-vendor-names`, and `admin.ts` as `access.ts` |
| `booth/` | `booth-access`, `booth-code`, `booth-color`, `booth-images`, prefix dropped               |

Everything else in `src/lib` stays flat: pairs like `cart` + `cart-storage`
do not earn a folder. Tests move with their files. Every affected folder
README is updated, and each new folder gets one. `AGENTS.md`'s File Layout
section names `src/lib/merqo-customer-notify.ts` and changes with it.

Acceptance: `git diff --stat -M` shows renames and import-path edits only.
`pnpm check`, `pnpm test`, `pnpm build` green.

## Out of scope

- Splitting `realtime-order-board.tsx` (1220 lines), `menu-editor.tsx`
  (1069), `order-card.tsx` (1012) and `order-form.tsx` (895). Worth doing,
  one file per PR, after this lands. Phase 2 already takes about 45 lines
  out of `order-form.tsx`.
- Moving payment and print concerns to paykit and printkit. That needs its
  own plan across three repos.
- Any change to `@merqo/ui`.

## Verification

Per phase, before the PR: the three commands above, then a local check at
375px with touch emulation of every page whose markup changed (measured:
no horizontal overflow, no control under 40px without an expanded hit area,
no truncated text).

Per phase, after merge and deploy, a production sweep on the test booths:

| Phase | Sweep                                                                                                                                                                                                |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Board sort switch, Completed date range, Stats range and "By volume / By revenue", booth Payment toggles. Every dashboard and admin page header. Ticket number agrees on board, status page, display |
| 2     | Customer page: add, increase, decrease to zero, per-order limit, basket hold from a second session. Walk-up dialog: add, sold-out block, order placed                                                |
| 3     | Every top-level route loads without a console error; one order placed end to end                                                                                                                     |

## Risks

- **#196 overlap.** The largest risk. Mitigated by waiting, then re-running
  the audit searches against `main` before Phase 1.
- **Stale READMEs after moves.** Every folder has one and they name files.
  Phase 3's diff must include them.
- **A missed dynamic import.** `order-card.tsx` loads
  `./payment-proof-viewer` with `import()`. Both move to `board/` together;
  the build catches a wrong path.
