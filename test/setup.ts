import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// Component tests opt into jsdom via a `// @vitest-environment jsdom` docblock.
// This setup runs for every file (node tests included), so only touch the DOM
// when one actually exists — otherwise the node-env lib tests would throw.
if (typeof Element !== "undefined") {
  // jsdom doesn't implement the Pointer Events capture API or scrollIntoView —
  // Radix's Select (and other popover-based primitives) call these during
  // open/close/keyboard-nav, which throws "not a function" under jsdom
  // without a no-op stand-in. Harmless everywhere else.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  // jsdom doesn't implement ResizeObserver at all — Radix's Tooltip/Select/
  // Popover primitives use it (via @radix-ui/react-use-size) to measure an
  // anchor element, throwing "ResizeObserver is not defined" the moment more
  // than one is mounted at once (e.g. several booth-toggle tooltips inside an
  // open dialog). A no-op stand-in is enough — no test asserts on layout.
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
}

afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
