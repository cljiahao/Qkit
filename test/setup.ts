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
}

afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
