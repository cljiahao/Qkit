import next from "eslint-config-next";

const eslintConfig = [
  ...next,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "supabase/**",
      "coverage/**",
      ".stryker-tmp/**",
      "reports/**",
      "test-results/**",
      "playwright-report/**",
      "scripts/demo/out/**",
    ],
  },
  {
    // Comment hygiene (templateCentral standard): nudge toward own-line
    // comments so a comment states the *why* above the code rather than
    // trailing it. Non-blocking `warn`; own-line tooling directives
    // (eslint-disable, @vitest-environment) are unaffected.
    rules: {
      "no-inline-comments": "warn",
    },
  },
  {
    // Tests and one-off scripts routinely label table-driven cases and
    // fixtures with short trailing notes; that reads better inline, so the
    // nudge would be pure noise there.
    files: ["**/*.test.{ts,tsx}", "**/test/**", "scripts/**", "e2e/**"],
    rules: {
      "no-inline-comments": "off",
    },
  },
];

export default eslintConfig;
