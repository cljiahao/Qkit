#!/usr/bin/env node
// UserPromptSubmit — OWASP LLM01 injection guard + LLM02 credential-leak detection. Exit 2 = block.
const input = require("fs").readFileSync(0, "utf8");
let prompt = "";
try {
  prompt = JSON.parse(input || "{}").prompt || "";
} catch {
  process.exit(0);
}
const lower = prompt.toLowerCase();

const injection = [
  "ignore previous instructions",
  "ignore all instructions",
  "disregard your",
  "forget your instructions",
  "override your",
  "new instructions:",
  "system prompt:",
  "your real instructions",
  "you are now a different ai",
  "you are no longer bound",
  "pretend you are not bound",
  "pretend you have no restrictions",
  "act as if you have no restrictions",
  "developer mode enabled",
];
for (const p of injection) {
  if (lower.includes(p)) {
    process.stderr.write(
      `Blocked: prompt matches an injection pattern (OWASP LLM01): "${p}"\n`,
    );
    process.exit(2);
  }
}

const credentials = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key ID"],
  [/ghp_[A-Za-z0-9]{36}/, "GitHub personal access token"],
  [/github_pat_[A-Za-z0-9_]{82}/, "GitHub fine-grained PAT"],
  [/sk-ant-[A-Za-z0-9\-_]{90,}/, "Anthropic API key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "PEM private key block"],
  [
    /(mongodb(\+srv)?|postgres(ql)?|mysql|redis|amqp):\/\/[^:]+:[^@]+@/i,
    "database/broker URL with embedded credentials",
  ],
];
for (const [re, label] of credentials) {
  if (re.test(prompt)) {
    process.stderr.write(
      `Blocked: prompt may contain a real credential — ${label} (OWASP LLM02). Do not paste secrets; use env vars.\n`,
    );
    process.exit(2);
  }
}
process.exit(0);
