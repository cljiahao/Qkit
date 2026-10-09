import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrast, mixOklch, parseOklch, themeModes } from "./theme-colors";

const css = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);

describe.each(Object.entries(themeModes(css)))(
  "qkit %s primary roles",
  (_mode, tokens) => {
    const text = parseOklch(tokens["--primary-text"]);
    const fill = parseOklch(tokens["--primary"]);
    it.each(["--background", "--card", "--popover", "--muted", "--accent"])(
      "small brand text meets AA on %s",
      (surface) =>
        expect(
          contrast(text, parseOklch(tokens[surface])),
        ).toBeGreaterThanOrEqual(4.5),
    );
    it("selected navigation text meets AA on the primary card wash", () => {
      expect(
        contrast(text, mixOklch(fill, parseOklch(tokens["--card"]), 0.12)),
      ).toBeGreaterThanOrEqual(4.5);
    });
    it("the unchanged primary button foreground meets AA on its fill", () => {
      expect(
        contrast(parseOklch(tokens["--primary-foreground"]), fill),
      ).toBeGreaterThanOrEqual(4.5);
    });
    it.each(["--background", "--card", "--popover"])(
      "input boundaries meet non-text AA on %s",
      (surface) =>
        expect(
          contrast(parseOklch(tokens["--input"]), parseOklch(tokens[surface])),
        ).toBeGreaterThanOrEqual(3),
    );
  },
);
