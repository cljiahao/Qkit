import { describe, expect, it } from "vitest";
import { hashBuffer } from "./hash";

describe("hashBuffer", () => {
  it("produces a stable 64-character hex digest for the same input", async () => {
    const buf = new TextEncoder().encode("hello").buffer;
    const a = await hashBuffer(buf);
    const b = await hashBuffer(buf);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("produces different digests for different input", async () => {
    const a = await hashBuffer(new TextEncoder().encode("hello").buffer);
    const b = await hashBuffer(new TextEncoder().encode("world").buffer);
    expect(a).not.toBe(b);
  });
});
