import { describe, it, expect } from "vitest";
import { boothColor } from "./booth-color";

describe("boothColor", () => {
  it("is deterministic for the same id", () => {
    expect(boothColor("booth-abc")).toBe(boothColor("booth-abc"));
  });

  it("returns a valid oklch string from the palette", () => {
    expect(boothColor("anything")).toMatch(/^oklch\(/);
  });

  it("distinguishes different booths (at least sometimes)", () => {
    const colors = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map(boothColor),
    );
    expect(colors.size).toBeGreaterThan(1);
  });
});
