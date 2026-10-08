import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const bash =
  process.platform === "win32"
    ? "C:/Program Files/Git/bin/bash.exe"
    : "/bin/bash";

function protect(file: string, tool = "Write") {
  const settings = JSON.parse(
    readFileSync(".claude/settings.json", "utf8"),
  ) as {
    hooks: { PreToolUse: { matcher: string; hooks: { command: string }[] }[] };
  };
  const command = settings.hooks.PreToolUse.find((hook) =>
    new RegExp(hook.matcher).test(tool),
  )?.hooks[0].command;
  if (!command) return { status: 0, stdout: "" };
  return spawnSync(bash, ["-c", command], {
    input: JSON.stringify({ tool_name: tool, tool_input: { file_path: file } }),
    encoding: "utf8",
  });
}

describe("file protection boundaries", () => {
  it.each([
    ".env.preview",
    "nested/.env.backup",
    "secrets/token.txt",
    "nested/.secrets/token.txt",
    "signing.pem",
  ])("blocks secret reads and writes: %s", (file) => {
    for (const tool of ["Read", "Edit", "Write"])
      expect(protect(file, tool).status).toBe(2);
  });
  it("normalizes Windows separators before checking secrets", () => {
    expect(protect("nested\\.env.preview").status).toBe(2);
  });
  it.each([
    ".env.example",
    "src/lib/example.ts",
    "./src/../src/lib/example.ts",
  ])("allows ordinary work: %s", (file) => {
    const result = protect(file);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });
  it.each([
    "AGENTS.md",
    "docs/CONSTITUTION.md",
    ".claude/settings.json",
    ".github/workflows/ci.yml",
  ])("asks for governance writes but allows reads: %s", (file) => {
    const result = protect(path.resolve(file));
    expect(result.status).toBe(0);
    expect(
      JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,
    ).toBe("ask");
    expect(protect(file, "Read").stdout).toBe("");
  });
  it("normalizes relative traversal before checking governance", () => {
    expect(
      JSON.parse(protect("./src/../AGENTS.md").stdout).hookSpecificOutput
        .permissionDecision,
    ).toBe("ask");
  });
});

describe("prompt guard", () => {
  function prompt(text: string) {
    return spawnSync(
      process.execPath,
      [".claude/hooks/user-prompt-guard.cjs"],
      {
        input: JSON.stringify({ prompt: text }),
        encoding: "utf8",
      },
    );
  }
  it("allows discussion of injection phrases without treating them as instructions", () => {
    const result = prompt(
      'Investigate the phrase "ignore previous instructions" in a malicious document.',
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("advisory");
  });
  it("still blocks synthetic credential-shaped input", () => {
    expect(prompt("ghp_" + "x".repeat(36)).status).toBe(2);
  });
});
