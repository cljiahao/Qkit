# PayNow Phase 1 — Same-Device UX Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make paying by PayNow on the same phone the customer is already using less painful — bigger QR, a save/share-to-photos button, and clear instructions — with zero change to `checkout.payload` or paykit's PayNow builder.

**Architecture:** All changes are in qkit's `pay-panel.tsx` (client component) plus one new pure DOM helper module. The QR is rendered by `react-qr-code` as an inline `<svg>`; a new helper rasterizes that SVG to a PNG `Blob` client-side, then either hands it to the Web Share API (mobile — opens the native "Save to Photos"/share sheet) or falls back to a plain `<a download>`.

**Tech Stack:** Next.js 16 App Router, React 19 client component, `react-qr-code`, Vitest + Testing Library (jsdom), Web Share API / `<canvas>` (browser-native, no new dependency).

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore` (AGENTS.md).
- No change to `CheckoutView`, `checkout.payload`, or any paykit code — this
  plan is qkit-only (per the [design spec](../specs/2026-08-13-paynow-tap-to-pay-design.md)).
- Work on a feature branch, never commit directly to `main`. The repo's
  current branch (`feat/design-critique-fixes-2026-08-12`) is an unrelated,
  already-in-flight UI pass — branch off `main` for this work, don't stack
  on it.
- Commit messages follow Conventional Commits (enforced by the `commit-msg`
  husky hook).
- Run `pnpm check && pnpm test` before considering any task done (AGENTS.md
  always-on invariant).
- New DOM/canvas-bound helper code is excluded from mutation testing scope
  by existing convention (AGENTS.md: "Components/actions/supabase clients
  are excluded (I/O- or DOM-bound, low signal)") — covered by the
  `pay-panel.dom.test.tsx` component test instead, with the rasterization
  helper itself mocked there (canvas isn't available in jsdom).

---

### Task 0: Branch setup

**Files:** none

- [ ] **Step 1: Create and switch to a feature branch off `main`**

```bash
git fetch origin main
git checkout -b feat/paynow-phase1-same-device-ux origin/main
```

- [ ] **Step 2: Confirm working tree is clean and tests pass before starting**

Run: `pnpm test`
Expected: all existing tests PASS (baseline, before any change).

---

### Task 1: Add `renderSvgToPngBlob` DOM helper

**Files:**

- Create: `src/app/order/[boothId]/[orderNumber]/qr-image.ts`

**Interfaces:**

- Produces: `renderSvgToPngBlob(svg: SVGSVGElement, size?: number): Promise<Blob>` — used by Task 2's `pay-panel.tsx`.

This is a pure DOM/canvas utility (no Supabase, no React) — not unit-tested
directly (jsdom has no real `<canvas>` 2D context; this project's existing
convention already excludes DOM-bound code like this from the
mutation-tested `src/lib` scope). Task 2's component test mocks this module
so `pay-panel.tsx`'s button logic is verified without needing real canvas
support.

- [ ] **Step 1: Write the helper**

```typescript
// Rasterizes an inline SVG (the QR react-qr-code renders) to a PNG Blob —
// PNG rather than SVG because a phone's "scan from gallery"/photo-picker
// flow expects a raster photo, and the Web Share API's "Save Image" sheet
// only recognizes raster image types.
export async function renderSvgToPngBlob(
  svg: SVGSVGElement,
  size = 512,
): Promise<Blob> {
  const svgMarkup = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not render QR image"));
      img.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not supported");
    // White background — the QR SVG itself has no fill behind its modules.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);

    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!pngBlob) throw new Error("Could not export QR image");
    return pngBlob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm check`
Expected: PASS (no test exists yet for this file — it's exercised indirectly in Task 2).

- [ ] **Step 3: Commit**

```bash
git add "src/app/order/[boothId]/[orderNumber]/qr-image.ts"
git commit -m "feat: add SVG-to-PNG rasterizer for the PayNow QR save button"
```

---

### Task 2: Add the save/share button + instruction copy to `PayPanel`

**Files:**

- Modify: `src/app/order/[boothId]/[orderNumber]/pay-panel.tsx`
- Test: `src/app/order/[boothId]/[orderNumber]/pay-panel.dom.test.tsx`

**Interfaces:**

- Consumes: `renderSvgToPngBlob(svg, size?)` from Task 1's `./qr-image`.

- [ ] **Step 1: Write the failing tests**

Append to `pay-panel.dom.test.tsx` (add `vi.mock("./qr-image", ...)` near the
top alongside the existing mocks, and these new `it` blocks inside the
existing `describe("PayPanel", ...)`):

```typescript
vi.mock("./qr-image", () => ({
  renderSvgToPngBlob: vi
    .fn()
    .mockResolvedValue(new Blob(["x"], { type: "image/png" })),
}));
```

```typescript
  it("shows a save button and instructions only for a QR checkout", () => {
    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        checkout={{ type: "qr", transactionId: "tx1", payload: "00020101" }}
        initialStatus="pending"
        amountCents={800}
      />,
    );
    expect(
      screen.getByRole("button", { name: /save qr image/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/scan it from your photos/i)).toBeInTheDocument();
  });

  it("hides the save button and instructions for a link checkout", () => {
    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        checkout={{
          type: "link",
          transactionId: "tx1",
          url: "https://a.b",
          label: "PayLah",
        }}
        initialStatus="pending"
        amountCents={500}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /save qr image/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/scan it from your photos/i)).not.toBeInTheDocument();
  });

  it("shares the QR image via the Web Share API when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    Object.assign(navigator, { share, canShare });

    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        checkout={{ type: "qr", transactionId: "tx1", payload: "00020101" }}
        initialStatus="pending"
        amountCents={800}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save qr image/i }));
    await waitFor(() => expect(share).toHaveBeenCalled());
  });

  it("falls back to a download link when Web Share is unavailable", async () => {
    Object.assign(navigator, { share: undefined, canShare: undefined });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    URL.createObjectURL = vi.fn().mockReturnValue("blob:mock");
    URL.revokeObjectURL = vi.fn();

    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        checkout={{ type: "qr", transactionId: "tx1", payload: "00020101" }}
        initialStatus="pending"
        amountCents={800}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save qr image/i }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    clickSpy.mockRestore();
  });

  it("shows an error toast if the QR can't be rasterized", async () => {
    const { renderSvgToPngBlob } = await import("./qr-image");
    vi.mocked(renderSvgToPngBlob).mockRejectedValueOnce(
      new Error("Canvas is not supported"),
    );
    const { toast } = await import("sonner");

    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        token="tok"
        checkout={{ type: "qr", transactionId: "tx1", payload: "00020101" }}
        initialStatus="pending"
        amountCents={800}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save qr image/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
```

Also change the `vi.mock("sonner", ...)` near the top from:

```typescript
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
```

(no change needed — already mocks `toast.error`, which is all the new code calls).

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm test pay-panel.dom.test.tsx`
Expected: FAIL — `renderSvgToPngBlob` import error (module not yet mocked-and-consumed) or "Unable to find role button with name /save qr image/i" for the new assertions; existing tests still PASS.

- [ ] **Step 3: Implement the button in `pay-panel.tsx`**

Add `useRef` to the React import:

```typescript
import { useCallback, useRef, useState } from "react";
```

Add a `Download` icon import alongside the existing `Check`:

```typescript
import { Check, Download } from "lucide-react";
```

Import the new helper:

```typescript
import { renderSvgToPngBlob } from "./qr-image";
```

Inside the component, alongside the existing `imgError` state, add:

```typescript
const qrWrapperRef = useRef<HTMLDivElement>(null);
const [saving, setSaving] = useState(false);

async function saveQrImage() {
  const svg = qrWrapperRef.current?.querySelector("svg");
  if (!svg) {
    toast.error("Couldn't prepare the QR to save.");
    return;
  }
  setSaving(true);
  try {
    const blob = await renderSvgToPngBlob(svg as SVGSVGElement);
    const file = new File([blob], "payment-qr.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        // Share sheet failed for a non-cancel reason — fall through to download.
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payment-qr.png";
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    toast.error("Couldn't prepare the QR to save. Screenshot it instead.");
  } finally {
    setSaving(false);
  }
}
```

Replace the existing QR-rendering block:

```typescript
      {checkout?.type === "qr" && (
        <div className="mx-auto w-fit rounded-xl bg-white p-4">
          <QRCode value={checkout.payload} size={180} />
        </div>
      )}
```

with (larger QR, wrapped in the ref, plus the save button and instructions):

```typescript
      {checkout?.type === "qr" && (
        <>
          <div
            ref={qrWrapperRef}
            className="mx-auto w-fit rounded-xl bg-white p-4"
          >
            <QRCode value={checkout.payload} size={220} />
          </div>
          <Button
            variant="outline"
            className="mx-auto flex h-10 w-fit items-center gap-2 rounded-xl"
            disabled={saving}
            onClick={saveQrImage}
          >
            <Download className="size-4" />
            Save QR image
          </Button>
          <p className="mx-auto max-w-xs text-center text-xs text-muted-foreground">
            On this phone? Save the QR, then open your banking app and scan
            it from your photos.
          </p>
        </>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test pay-panel.dom.test.tsx`
Expected: PASS — all new and existing tests green.

- [ ] **Step 5: Full quality gate**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/order/[boothId]/[orderNumber]/pay-panel.tsx" "src/app/order/[boothId]/[orderNumber]/pay-panel.dom.test.tsx"
git commit -m "feat: add save/share QR image button to the PayNow pay panel"
```

---

## Self-Review Notes

- **Spec coverage:** Phase 1's three asks from the design spec — bigger QR
  (Task 2, 180→220), save/share button (Task 1+2), instruction copy
  (Task 2) — are each covered by a task. Error handling (toast on
  rasterize failure) and the "only shown for `type: qr`" scoping are
  covered by dedicated test cases.
- **Placeholder scan:** none — every step has real code.
- **Type consistency:** `renderSvgToPngBlob(svg: SVGSVGElement, size?: number): Promise<Blob>` is defined once in Task 1 and consumed with the same signature in Task 2.
