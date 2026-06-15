import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// Component tests opt into jsdom via a `// @vitest-environment jsdom` docblock.
// This setup runs for every file (node tests included), so only touch the DOM
// when one actually exists — otherwise the node-env lib tests would throw.
afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
