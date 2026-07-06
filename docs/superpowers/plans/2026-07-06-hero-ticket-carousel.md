# Hero Ticket Carousel + Avatar Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the landing hero's two-board opacity cross-fade with a swipeable 4-board carousel of higher-fidelity order chits, and fix broken Google profile avatars.

**Architecture:** A pure `nearestIndex` helper (unit-tested) + a presentational `LandingTicket` chit + a data-driven `LandingBoard` + a typed 4-board data module, composed by a rewritten `HeroPreviewCarousel` that uses native horizontal scroll-snap (finger/trackpad) plus pointer-drag (mouse) and a 10s auto-advance that pauses on interaction. The two old hand-built board components are deleted. Separately, `next.config.ts` whitelists `*.googleusercontent.com` for `next/image`.

**Tech Stack:** Next.js 16, React client components, TypeScript strict, Tailwind v4, Vitest (node + jsdom/RTL), lucide-react.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- The carousel + boards are DECORATIVE: the root stays `aria-hidden` (as today). No keyboard/AT navigation required.
- All ticket figures are fixed sample data — no fetching, no real orders.
- Reuse the real card's visual language: `.ticket`, `.perforation`, and washes `.ticket-alert` / `.ticket-aging` / `.ticket-overdue` (defined in `src/app/globals.css`); status colours via `--color-status-<status>` CSS vars. Visual reference files: `src/components/order-card.tsx` and the current `src/components/landing-board-preview.tsx`.
- Local gate: `pnpm check` (prettier + eslint + tsc) and `pnpm test` (vitest). No e2e change.
- Pure logic lives in `src/lib` (repo's mutation-tested convention); components are covered by `*.dom.test.tsx`.

---

### Task 1: `nearestIndex` pure helper

**Files:**

- Create: `src/lib/carousel.ts`
- Test: `src/lib/carousel.test.ts`

**Interfaces:**

- Produces: `nearestIndex(scrollLeft: number, boardWidth: number, count: number): number` — the index of the board nearest the current horizontal scroll offset, clamped to `[0, count-1]`; returns `0` when `boardWidth <= 0`.

- [ ] **Step 1: Write the failing test**

`src/lib/carousel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nearestIndex } from "./carousel";

describe("nearestIndex", () => {
  it("rounds to the nearest board", () => {
    expect(nearestIndex(0, 300, 4)).toBe(0);
    expect(nearestIndex(140, 300, 4)).toBe(0); // < half → board 0
    expect(nearestIndex(160, 300, 4)).toBe(1); // > half → board 1
    expect(nearestIndex(600, 300, 4)).toBe(2);
  });

  it("clamps to the last board", () => {
    expect(nearestIndex(99999, 300, 4)).toBe(3);
  });

  it("clamps to the first board on negative overscroll", () => {
    expect(nearestIndex(-50, 300, 4)).toBe(0);
  });

  it("returns 0 for a zero/negative board width", () => {
    expect(nearestIndex(500, 0, 4)).toBe(0);
    expect(nearestIndex(500, -10, 4)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- carousel`
Expected: FAIL — `nearestIndex` not exported / module missing.

- [ ] **Step 3: Write the implementation**

`src/lib/carousel.ts`:

```ts
/** Index of the board nearest the current horizontal scroll offset,
 *  clamped to [0, count-1]. Returns 0 for a non-positive board width. */
export function nearestIndex(
  scrollLeft: number,
  boardWidth: number,
  count: number,
): number {
  if (boardWidth <= 0) return 0;
  const raw = Math.round(scrollLeft / boardWidth);
  return Math.min(Math.max(raw, 0), count - 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- carousel`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/carousel.ts src/lib/carousel.test.ts
git commit -m "feat(landing): nearestIndex carousel helper"
```

---

### Task 2: `LandingTicket` chit + types

**Files:**

- Create: `src/components/landing-ticket.tsx`
- Test: `src/components/landing-ticket.dom.test.tsx`

**Interfaces:**

- Produces (exported types, consumed by Tasks 3):
  ```ts
  export type TicketLine = {
    q: number;
    name: string;
    opt?: string;
    price?: string;
  };
  export type LandingTicketData = {
    n: string;
    name: string;
    status: "preparing" | "ready" | "completed";
    payment?: "unpaid" | "claimed" | "paid";
    age?: { label: string; tone: "normal" | "aging" | "overdue" };
    lines: TicketLine[];
    total?: string;
    action?: string;
  };
  ```
- Produces: `export function LandingTicket({ t }: { t: LandingTicketData }): JSX.Element` — one chit whose markup mirrors `order-card.tsx`.

- [ ] **Step 1: Write the failing test**

`src/components/landing-ticket.dom.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingTicket, type LandingTicketData } from "./landing-ticket";

const priced: LandingTicketData = {
  n: "0042",
  name: "Ada",
  status: "preparing",
  payment: "unpaid",
  age: { label: "4m", tone: "aging" },
  lines: [{ q: 2, name: "Kopi", opt: "Iced", price: "$3.60" }],
  total: "$3.60",
  action: "Mark Ready",
};

const queueOnly: LandingTicketData = {
  n: "0009",
  name: "Wei",
  status: "ready",
  lines: [{ q: 1, name: "Single Scoop", opt: "Vanilla" }],
};

describe("LandingTicket", () => {
  it("renders number, name, line, total and action", () => {
    const { container } = render(<LandingTicket t={priced} />);
    expect(screen.getByText("#0042")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Kopi")).toBeInTheDocument();
    expect(screen.getByText("$3.60")).toBeInTheDocument();
    expect(screen.getByText("Mark Ready")).toBeInTheDocument();
    // aging tone → aging wash on the chit
    expect(container.querySelector(".ticket-aging")).not.toBeNull();
    // payment badge present
    expect(screen.getByText("Unpaid")).toBeInTheDocument();
    // age clock
    expect(screen.getByText("4m")).toBeInTheDocument();
  });

  it("renders queue-only: no total, no payment badge, no wash", () => {
    const { container } = render(<LandingTicket t={queueOnly} />);
    expect(screen.getByText("Single Scoop")).toBeInTheDocument();
    expect(screen.queryByText(/Total/i)).toBeNull();
    expect(screen.queryByText("Unpaid")).toBeNull();
    expect(screen.queryByText("Paid")).toBeNull();
    expect(
      container.querySelector(".ticket-aging,.ticket-overdue,.ticket-alert"),
    ).toBeNull();
  });

  it("uses the alert wash + Says paid when payment is claimed", () => {
    const { container } = render(
      <LandingTicket t={{ ...priced, payment: "claimed", age: undefined }} />,
    );
    expect(screen.getByText("Says paid")).toBeInTheDocument();
    expect(container.querySelector(".ticket-alert")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- landing-ticket`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the chit**

Create `src/components/landing-ticket.tsx`. Read `src/components/order-card.tsx` (the real card) and `src/components/landing-board-preview.tsx` (current chit markup + status-token pattern) first, and match their look. Requirements the test pins:

- Export the two types above.
- Root chit `div`: base classes `flex flex-col overflow-hidden rounded-xl border bg-background/60`, PLUS a wash class chosen by priority — `t.age?.tone === "overdue"` → `ticket-overdue`; else `t.payment === "claimed"` → `ticket-alert`; else `t.age?.tone === "aging"` → `ticket-aging`; else `border-border` (same priority order as `order-card.tsx`).
- Header row: mono `#${t.n}` (`font-mono text-lg font-bold`), `t.name` beneath (`text-xs text-muted-foreground`), and on the right a status badge coloured with inline style `color: var(--color-status-${t.status})` + `backgroundColor: color-mix(in oklch, var(--color-status-${t.status}) 14%, transparent)` (copy the pattern from `landing-board-preview.tsx`). Status label: capitalize (`preparing`→"Preparing", `ready`→"Ready", `completed`→"Done").
- Payment badge when `t.payment` set (skip when undefined): `unpaid`→"Unpaid" muted (`bg-secondary text-muted-foreground`); `claimed`→"Says paid" (`bg-blue-600 text-white`); `paid`→"Paid" (`bg-emerald-600 text-white`). Small pill like `PaymentBadge` in order-card.
- Age clock when `t.age` set: `<Clock className="size-3" />` from lucide-react + `t.age.label`, text colour by tone (`normal`→`text-muted-foreground`, `aging`→`text-amber-600`, `overdue`→`text-status-cancelled`).
- `<div className="perforation mx-3" />`, then lines: each `t.lines[i]` renders `<span className="font-mono text-muted-foreground">{q}×</span> {name}`, an option sub-line (`opt`) when present, and a right-aligned mono `price` when present.
- When `t.total` set: a `perforation` + a Total row ("Total" label + mono `t.total`).
- When `t.action` set: a pill `<span className="block rounded-lg bg-primary ... text-primary-foreground">{t.action}</span>` (non-interactive, like the current preview).
- No `aria-hidden` needed here (the carousel root carries it).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- landing-ticket && pnpm check`
Expected: PASS (3 tests) + clean tsc/eslint/prettier.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing-ticket.tsx src/components/landing-ticket.dom.test.tsx
git commit -m "feat(landing): high-fidelity LandingTicket chit"
```

---

### Task 3: `LandingBoard` + the 4-board data

**Files:**

- Create: `src/components/landing-board.tsx`
- Create: `src/components/landing-boards.ts`
- Test: `src/components/landing-board.dom.test.tsx`

**Interfaces:**

- Consumes: `LandingTicket`, `LandingTicketData` from Task 2.
- Produces:

  ```ts
  // landing-board.tsx
  export type LandingBoardData = {
    key: string;
    title: string;
    activeCount: number;
    tickets: LandingTicketData[];
  };
  export function LandingBoard({
    board,
  }: {
    board: LandingBoardData;
  }): JSX.Element;
  // landing-boards.ts
  export const LANDING_BOARDS: LandingBoardData[]; // length 4: coffee, icecream, payment, rush
  ```

- [ ] **Step 1: Write the failing test**

`src/components/landing-board.dom.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingBoard } from "./landing-board";
import { LANDING_BOARDS } from "./landing-boards";

describe("LANDING_BOARDS", () => {
  it("has the 4 expected boards", () => {
    expect(LANDING_BOARDS.map((b) => b.key)).toEqual([
      "coffee",
      "icecream",
      "payment",
      "rush",
    ]);
  });

  it("icecream board is queue-only (no ticket has a total or payment)", () => {
    const ice = LANDING_BOARDS.find((b) => b.key === "icecream")!;
    for (const t of ice.tickets) {
      expect(t.total).toBeUndefined();
      expect(t.payment).toBeUndefined();
    }
  });

  it("payment board shows a claimed and a paid ticket", () => {
    const pay = LANDING_BOARDS.find((b) => b.key === "payment")!;
    const payments = pay.tickets.map((t) => t.payment);
    expect(payments).toContain("claimed");
    expect(payments).toContain("paid");
  });

  it("rush board has an overdue ticket", () => {
    const rush = LANDING_BOARDS.find((b) => b.key === "rush")!;
    expect(rush.tickets.some((t) => t.age?.tone === "overdue")).toBe(true);
  });
});

describe("LandingBoard", () => {
  it("renders the header count and each ticket", () => {
    render(<LandingBoard board={LANDING_BOARDS[0]} />);
    expect(screen.getByText(/active/i)).toBeInTheDocument();
    expect(screen.getByText("#0042")).toBeInTheDocument();
  });
});
```

(If the coffee board's first ticket is not `#0042`, adjust that assertion to the number chosen in Step 3 — keep the two in sync.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- landing-board`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement board + data**

`src/components/landing-board.tsx` — export `LandingBoardData` type (as above) and `LandingBoard`. Render the `.ticket` container exactly as the current `landing-board-preview.tsx` does (classes: `ticket relative w-full overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-[...]`), a header row with `Live orders` on the left and a pulsing-dot + `${board.activeCount} active` on the right (copy the pulsing-dot markup from `landing-board-preview.tsx`), then `<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">` mapping `board.tickets` to `<LandingTicket key={t.n} t={t} />`.

`src/components/landing-boards.ts` — `import type { LandingTicketData } from "./landing-ticket"` and `import type { LandingBoardData } from "./landing-board"`; export `LANDING_BOARDS: LandingBoardData[]` with these 4 boards (fill line items to taste, keeping the constraints the tests pin):

1. `key:"coffee"`, `title:"Kopitiam Cart"`, `activeCount:2` — ticket `#0042` Ada `preparing` `age {label:"4m",tone:"aging"}` payment `unpaid`, line `2× Kopi (Iced) $3.60`, total `$3.60`, action "Mark Ready"; ticket `#0041` Wei `ready`, lines `1× Milo (Hot) $2.20` + `3× Teh (Less sugar) $5.40`, total `$7.60`, action "Mark Picked Up".
2. `key:"icecream"`, `title:"Ice Cream Cart"`, `activeCount:2` — tickets with NO `total`, NO `payment`, NO `price` on lines. `#0018` Mei `preparing`, `1× Single Scoop (Vanilla)`, action "Mark Ready"; `#0017` Sam `ready`, `2× Double Scoop`, action "Mark Picked Up".
3. `key:"payment"`, `title:"Kopitiam Cart"`, `activeCount:2` — `#0031` Nur `preparing` payment `claimed`, `1× Kopi (Iced) $1.80`, total `$1.80`, action "Confirm payment received"; `#0030` Jun `completed` payment `paid`, `2× Teh $3.60`, total `$3.60` (no action — done).
4. `key:"rush"`, `title:"Kopitiam Cart"`, `activeCount:3` — `#0056` Lim `preparing` `age {label:"12m",tone:"overdue"}`, `2× Milo (Iced) $4.40`, total `$4.40`, action "Mark Ready"; `#0057` Aisha `preparing` `age {label:"7m",tone:"aging"}`, `1× Kopi $1.40`, total `$1.40`, action "Mark Ready"; `#0058` Tan `preparing` `age {label:"1m",tone:"normal"}`, `1× Teh $1.40`, total `$1.40`, action "Mark Ready".

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- landing-board && pnpm check`
Expected: PASS (5 tests) + clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing-board.tsx src/components/landing-boards.ts src/components/landing-board.dom.test.tsx
git commit -m "feat(landing): data-driven board + 4 scenario boards"
```

---

### Task 4: Rewrite `HeroPreviewCarousel` (swipeable) + delete old boards

**Files:**

- Modify (full rewrite): `src/components/hero-preview-carousel.tsx`
- Delete: `src/components/landing-board-preview.tsx`, `src/components/landing-order-preview-icecream.tsx`
- Test: `src/components/hero-preview-carousel.dom.test.tsx`

**Interfaces:**

- Consumes: `LANDING_BOARDS` (Task 3), `LandingBoard` (Task 3), `nearestIndex` (Task 1).
- Produces: `export function HeroPreviewCarousel(): JSX.Element` — unchanged import used by `src/app/page.tsx:5`.

- [ ] **Step 1: Confirm the only consumer is the landing page**

Run: `grep -rn "landing-board-preview\|landing-order-preview-icecream\|HeroPreviewCarousel" src --include="*.tsx" | grep -v ".dom.test."`
Expected: imports of the two old previews appear ONLY inside `hero-preview-carousel.tsx`; `HeroPreviewCarousel` is imported only by `src/app/page.tsx`. If anything else imports the old previews, stop and report — deleting would break it.

- [ ] **Step 2: Write the failing test**

`src/components/hero-preview-carousel.dom.test.tsx`:

```tsx
import { render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroPreviewCarousel } from "./hero-preview-carousel";

function mockMatchMedia(reduced: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: reduced,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("HeroPreviewCarousel", () => {
  it("renders all 4 boards and 4 dots", () => {
    mockMatchMedia(false);
    const { container } = render(<HeroPreviewCarousel />);
    // Each board renders its "Live orders" header.
    expect(screen.getAllByText(/Live orders/i)).toHaveLength(4);
    // 4 position dots (data-testid on each dot).
    expect(container.querySelectorAll("[data-dot]")).toHaveLength(4);
  });

  it("does not auto-advance the active dot under reduced motion", () => {
    vi.useFakeTimers();
    mockMatchMedia(true);
    const { container } = render(<HeroPreviewCarousel />);
    const activeBefore = container.querySelector(
      '[data-dot][data-active="true"]',
    );
    act(() => {
      vi.advanceTimersByTime(11_000);
    });
    const activeAfter = container.querySelector(
      '[data-dot][data-active="true"]',
    );
    // Same dot is active — no interval scheduled a scroll.
    expect(activeAfter).toBe(activeBefore);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- hero-preview-carousel`
Expected: FAIL (old component has no boards/dots with these hooks).

- [ ] **Step 4: Rewrite the carousel**

Replace the whole file `src/components/hero-preview-carousel.tsx` with:

```tsx
"use client";

// Hero visual: a swipeable horizontal carousel of mock "live order" boards so
// visitors see the real product board (pricing, queue-only, payment, rush).
// Native scroll-snap handles finger + trackpad; pointer handlers add mouse
// click-drag; a 10s timer auto-advances but pauses while the visitor interacts.
// Decorative only (aria-hidden). Reduced-motion: no auto-advance, no smooth.

import { useCallback, useEffect, useRef, useState } from "react";
import { LandingBoard } from "@/components/landing-board";
import { LANDING_BOARDS } from "@/components/landing-boards";
import { nearestIndex } from "@/lib/carousel";

const ROTATE_MS = 10_000;

export function HeroPreviewCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const timer = useRef<number | null>(null);
  const reduced = useRef(false);

  const boardWidth = () => trackRef.current?.clientWidth ?? 0;

  const scrollToIndex = useCallback((i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({
      left: i * el.clientWidth,
      behavior: reduced.current ? "auto" : "smooth",
    });
  }, []);

  const stopTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (reduced.current) return;
    stopTimer();
    timer.current = window.setInterval(() => {
      const el = trackRef.current;
      if (!el) return;
      const cur = nearestIndex(
        el.scrollLeft,
        el.clientWidth,
        LANDING_BOARDS.length,
      );
      scrollToIndex((cur + 1) % LANDING_BOARDS.length);
    }, ROTATE_MS);
  }, [scrollToIndex, stopTimer]);

  useEffect(() => {
    reduced.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    startTimer();
    return stopTimer;
  }, [startTimer, stopTimer]);

  // Keep the active dot in sync with the scroll position.
  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setActive(
      nearestIndex(el.scrollLeft, el.clientWidth, LANDING_BOARDS.length),
    );
  }, []);

  // Mouse click-drag to scroll (touch/trackpad use native scroll).
  const drag = useRef<{ startX: number; startLeft: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    stopTimer();
    const el = trackRef.current;
    if (!el) return;
    drag.current = { startX: e.clientX, startLeft: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const el = trackRef.current;
    if (!drag.current || !el) return;
    el.scrollLeft = drag.current.startLeft - (e.clientX - drag.current.startX);
  };
  const endDrag = (e: React.PointerEvent) => {
    const el = trackRef.current;
    if (drag.current && el) {
      el.releasePointerCapture?.(e.pointerId);
      scrollToIndex(
        nearestIndex(el.scrollLeft, el.clientWidth, LANDING_BOARDS.length),
      );
    }
    drag.current = null;
    startTimer();
  };

  return (
    <div aria-hidden>
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerEnter={stopTimer}
        onPointerLeave={startTimer}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {LANDING_BOARDS.map((board) => (
          <div key={board.key} className="w-full shrink-0 snap-center px-0.5">
            <LandingBoard board={board} />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-center gap-1.5">
        {LANDING_BOARDS.map((board, i) => (
          <button
            key={board.key}
            type="button"
            tabIndex={-1}
            data-dot
            data-active={i === active}
            onClick={() => {
              stopTimer();
              scrollToIndex(i);
              startTimer();
            }}
            className={
              "size-1.5 rounded-full transition-colors duration-500 " +
              (i === active ? "bg-primary" : "bg-border")
            }
          />
        ))}
      </div>
    </div>
  );
}
```

Then delete the two old previews:

```bash
git rm src/components/landing-board-preview.tsx src/components/landing-order-preview-icecream.tsx
```

- [ ] **Step 5: Run tests + full check**

Run: `pnpm test -- hero-preview-carousel && pnpm check`
Expected: PASS (2 tests) + clean tsc/eslint/prettier. (`clientWidth`/`scrollTo` are `0`/no-ops in jsdom; the tests only assert board+dot rendering and the reduced-motion no-advance path, which hold regardless.)

- [ ] **Step 6: Full suite**

Run: `pnpm test`
Expected: all pass (no leftover import of the deleted components).

- [ ] **Step 7: Commit**

```bash
git add src/components/hero-preview-carousel.tsx src/components/hero-preview-carousel.dom.test.tsx
git commit -m "feat(landing): swipeable 4-board hero carousel"
```

---

### Task 5: Avatar fix — whitelist Google image host

**Files:**

- Modify: `next.config.ts` (the `images.remotePatterns` array)

**Interfaces:** none (config only).

- [ ] **Step 1: Add the remote pattern**

In `next.config.ts`, add to `images.remotePatterns` (alongside the existing `127.0.0.1` and `*.supabase.co` entries):

```ts
{ protocol: "https", hostname: "*.googleusercontent.com" },
```

- [ ] **Step 2: Verify config typechecks**

Run: `pnpm check`
Expected: clean (prettier + eslint + tsc).

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "fix(image): allow Google avatar host for next/image"
```

Note (not a code step): the fix is build-time inlined — it takes effect only after a rebuild/redeploy (Vercel rebuilds on push). Manual post-deploy check: a Google-signed-in vendor's avatar renders in the dashboard nav instead of a broken image.

---

## Self-Review

**Spec coverage:** carousel swipe/drag/auto-advance/pause/reduced-motion → Task 4; higher-fidelity chit (badges/washes/age) → Task 2; 4 boards data → Task 3; DRY delete of 2 old boards → Task 4; `nearestIndex` unit-tested helper → Task 1; avatar `next.config` fix → Task 5; decorative `aria-hidden` → Task 4 root. All spec sections covered. ✓

**Placeholder scan:** no TBD/TODO; every code step has real code or (for the presentational chit) an exact class/behavior list pinned by tests + named reference files. ✓

**Type consistency:** `LandingTicketData`/`TicketLine` defined in Task 2, imported by Task 3; `LandingBoardData` defined in Task 3, used by `LANDING_BOARDS` + Task 4; `nearestIndex(scrollLeft, boardWidth, count)` signature identical in Task 1 and its call sites in Task 4. Board `key` order `["coffee","icecream","payment","rush"]` asserted in Task 3 matches Task 3 data + Task 4 iteration. ✓

**Risk carried from spec:** if `scrollTo({behavior:"smooth"})` fights snap-mandatory on some engine, the auto-advance may look janky — acceptable fallback is `behavior:"auto"` for auto-advance; not blocking. Reduced-motion already uses `auto`.
