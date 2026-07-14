# Nav Plan-to-Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move qkit's "Plan" link out of the top-level navbar and into the account dropdown, in the identity-first order (`Profile → Board settings → Plan → Get help → Feedback → Sign out`) established in this session's cross-kit nav research.

**Architecture:** Single-file change in `DashboardNav`: remove one entry from the `LINKS` array (which drives both desktop inline nav and the mobile nav panel), add one new `DropdownMenuItem` at the correct position in the account dropdown. This is qkit's half of a cross-kit standardization (loopkit's half already shipped — reordered its dropdown to `Profile → Settings → Plan`).

**Tech Stack:** Next.js 16, TypeScript strict, Tailwind v4, shadcn/ui, Vitest + Testing Library (jsdom), pnpm.

## Global Constraints

- Every commit must leave `pnpm check` (prettier --check + eslint + tsc --noEmit) clean.
- No change to `src/app/dashboard/plan/page.tsx` or any of its pricing/CTA content — this is pure nav wiring, not a change to the Plan page itself.
- No change to `TierBadge`, `Avatar`, or account-label rendering.
- No change to the Help/Feedback drawers or their trigger items' position relative to each other — only Plan's insertion point relative to them is in scope.
- Radix's `DropdownMenuItem asChild` renders its child `<a>` with `role="menuitem"`, not `role="link"` — confirmed directly against this same shadcn dropdown-menu component in the sibling loopkit repo (`getAllByRole("link")` finds nothing inside an open dropdown; `getAllByRole("menuitem")` is correct). Any new test asserting dropdown item order must query `role="menuitem"`, not `"link"`.

---

### Task 1: Move Plan into the account dropdown

**Files:**

- Modify: `src/app/dashboard/dashboard-nav.tsx`
- Create: `src/app/dashboard/dashboard-nav.dom.test.tsx` (no existing test file for this component — confirmed via glob)

**Interfaces:**

- No exported signature change — `DashboardNav`'s props (`signOut`, `vendorName`, `avatarUrl`, `tier`) are unchanged.

- [ ] **Step 1: Write the failing test**

Create `src/app/dashboard/dashboard-nav.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardNav } from "./dashboard-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

describe("DashboardNav", () => {
  const baseProps = {
    signOut: vi.fn(async () => {}),
    vendorName: "Kopi Corner",
    avatarUrl: null,
    tier: "free" as const,
  };

  it("renders Orders, Booths, and Stats as inline nav links, with no Plan link", () => {
    render(<DashboardNav {...baseProps} />);
    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: "Booths" })).toHaveAttribute(
      "href",
      "/dashboard/booths",
    );
    expect(screen.getByRole("link", { name: "Stats" })).toHaveAttribute(
      "href",
      "/dashboard/stats",
    );
    expect(
      screen.queryByRole("link", { name: "Plan" }),
    ).not.toBeInTheDocument();
  });

  it("account menu has Profile, Board settings, Plan, Get help, Feedback (in that order), then Sign out", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    const accountButton = screen.getByRole("button", {
      name: /account menu/i,
    });
    await user.click(accountButton);

    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems.map((item) => item.textContent)).toEqual([
      "Profile",
      "Board settings",
      "Plan",
      "Get help",
      "Feedback",
      "Sign out",
    ]);
    expect(screen.getByRole("menuitem", { name: "Plan" })).toHaveAttribute(
      "href",
      "/dashboard/plan",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test dashboard-nav.dom.test.tsx`
Expected: FAIL — the first test fails because `LINKS` still contains a `Plan` entry (an inline "Plan" link exists in the top nav); the second test fails because the dropdown's `menuitem` list is currently `["Profile", "Board settings", "Get help", "Feedback", "Sign out"]` (no "Plan"), not the expected 6-item list.

- [ ] **Step 3: Remove Plan from LINKS, add the Wallet import**

In `src/app/dashboard/dashboard-nav.tsx`, add `Wallet` to the existing `lucide-react` import list:

```tsx
import {
  ChevronDown,
  LifeBuoy,
  LogOut,
  Menu,
  MessageSquarePlus,
  Settings,
  User,
  Wallet,
  X,
} from "lucide-react";
```

Change the `LINKS` array from:

```tsx
const LINKS = [
  { href: "/dashboard", label: "Orders" },
  { href: "/dashboard/booths", label: "Booths" },
  { href: "/dashboard/stats", label: "Stats" },
  { href: "/dashboard/plan", label: "Plan" },
];
```

to:

```tsx
const LINKS = [
  { href: "/dashboard", label: "Orders" },
  { href: "/dashboard/booths", label: "Booths" },
  { href: "/dashboard/stats", label: "Stats" },
];
```

- [ ] **Step 4: Insert the Plan dropdown item**

In the same file, insert a new `DropdownMenuItem` between the existing "Board settings" item and the "Get help" item:

```tsx
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings" className="cursor-pointer">
                <Settings className="size-4" />
                Board settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/plan" className="cursor-pointer">
                <Wallet className="size-4" />
                Plan
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => setHelpOpen(true)}
            >
              <LifeBuoy className="size-4" />
              Get help
            </DropdownMenuItem>
```

(Only the new "Plan" block is added — the "Board settings" and "Get help" blocks either side of it are unchanged, shown here only to pin the exact insertion point.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test dashboard-nav.dom.test.tsx`
Expected: PASS (both tests)

- [ ] **Step 6: Run the full test suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: All pass.

- [ ] **Step 7: Manually verify in the running app**

Run: `pnpm dev`, sign in, confirm the top nav reads Orders / Booths / Stats (no Plan tab), then open the account dropdown (avatar, top right) and confirm the order reads Profile, Board settings, Plan, Get help, Feedback, then a separator, then Sign out. Confirm clicking "Plan" navigates to `/dashboard/plan` and the page itself (pricing cards, CTAs) is unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/dashboard-nav.tsx src/app/dashboard/dashboard-nav.dom.test.tsx
git commit -m "fix(nav): move Plan from top navbar into the account dropdown"
```
