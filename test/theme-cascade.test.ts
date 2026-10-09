import { readFileSync } from "node:fs";
import { compile } from "tailwindcss";
import { expect, it } from "vitest";

function borderDeclarations(css: string) {
  const ancestors: string[] = [];
  const result: { ancestors: string[]; value: string }[] = [];
  for (const raw of css.split("\n")) {
    const line = raw.trim();
    if (line.endsWith("{")) ancestors.push(line.slice(0, -1).trim());
    else if (line === "}") ancestors.pop();
    else if (line.startsWith("border-color:"))
      result.push({ ancestors: [...ancestors], value: line.slice(13).trim() });
  }
  return result;
}

it("compiled input boundary overrides the base reset without changing separators", async () => {
  const source = readFileSync(
    new URL("../src/app/globals.css", import.meta.url),
    "utf8",
  );
  // Compile real theme/reset rules with explicit candidates, without resolving external imports or scanning files.
  const css = source
    .split("\n")
    .filter(
      (line) => !line.startsWith("@import ") && !line.startsWith("@source "),
    )
    .join("\n");
  const compiler = await compile(
    "@layer theme, base, components, utilities;\n" +
      css +
      "\n@layer utilities { @tailwind utilities; }",
  );
  const declarations = borderDeclarations(
    compiler.build(["border-input", "border-border"]),
  );
  const defaults = declarations.filter(
    (entry) => entry.ancestors.at(-1) === "*",
  );
  expect(defaults.length).toBeGreaterThan(0);
  expect(
    defaults.every((entry) => entry.ancestors.includes("@layer base")),
  ).toBe(true);
  expect(declarations).toContainEqual({
    ancestors: ["@layer utilities", ".border-input"],
    value: "var(--input);",
  });
  expect(declarations).toContainEqual({
    ancestors: ["@layer utilities", ".border-border"],
    value: "var(--border);",
  });
});
