// Pre-commit reminder (never blocks): if a folder's source changed in this
// commit but its own README.md didn't, print a nudge to refresh it. READMEs
// are agent-written prose (what the folder does, real behavior) — no script
// can regenerate that, so this only nags; it can't write the update itself.
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const SOURCE_EXT = new Set([".ts", ".tsx", ".mjs", ".sql", ".css", ".json"]);
const SKIP_SUFFIXES = [".test.ts", ".test.tsx", ".dom.test.tsx"];

function stagedFiles() {
  const out = execSync("git diff --cached --name-only --diff-filter=ACMR", {
    encoding: "utf8",
  });
  return out.split("\n").filter(Boolean);
}

function main() {
  const staged = stagedFiles();
  const stagedSet = new Set(staged);
  const touchedDirs = new Set();

  for (const file of staged) {
    const base = path.basename(file);
    if (base === "README.md") continue;
    if (SKIP_SUFFIXES.some((s) => base.endsWith(s))) continue;
    if (!SOURCE_EXT.has(path.extname(file))) continue;
    touchedDirs.add(path.dirname(file));
  }

  const stale = [];
  for (const dir of touchedDirs) {
    const readme = path.join(dir, "README.md");
    if (fs.existsSync(readme) && !stagedSet.has(readme.replace(/\\/g, "/"))) {
      stale.push(readme);
    }
  }

  if (stale.length) {
    console.log(
      `\nnote: source changed in ${stale.length} folder(s) with a README.md not included in this commit:`,
    );
    for (const r of stale) console.log(`  - ${r}`);
    console.log(
      "Consider refreshing it if the change affects what the folder does.\n",
    );
  }
}

main();
