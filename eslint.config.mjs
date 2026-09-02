import next from "eslint-config-next";
import sonarjs from "eslint-plugin-sonarjs";

// next's default export already registers @typescript-eslint (as the
// "next/typescript" block) — reuse that instance rather than adding a
// second direct dependency on @typescript-eslint/eslint-plugin.
const typescriptEslintPlugin = next.find((c) => c.name === "next/typescript")
  .plugins["@typescript-eslint"];

// sonarjs.configs.recommended carries its own internal plugin instance (not
// === the `sonarjs` import above) — every config block below that sets a
// sonarjs/* rule reuses THIS reference, never the raw import, or ESLint
// throws "Cannot redefine plugin sonarjs" when two different object
// identities both try to bind the same plugin name.
const sonarjsPlugin = sonarjs.configs.recommended.plugins.sonarjs;

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
      ".worktrees/**",
      ".claude/worktrees/**",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "@typescript-eslint": typescriptEslintPlugin },
    rules: {
      // Neither tsconfig (no noUnusedLocals/noUnusedParameters) nor
      // eslint-config-next's own "next/typescript" block flags unused
      // vars/imports — this project's `_`-prefix convention for
      // intentionally-unused args is the ignore signal, matching
      // templatecentral's scaffold convention.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // sonarjs's full recommended rule catalog (bugs, security — hardcoded
    // secrets/weak crypto/insecure cookies —, code smells, test hygiene,
    // React/JSX rules), not just the one hand-picked rule this project
    // started with. `no-commented-code` is "off" in sonarjs's own
    // recommended set, so it's re-enabled explicitly alongside the
    // pre-existing `no-inline-comments` gate — both are the templateCentral
    // comment-hygiene standard (hard gate as of 5.8). See
    // templatecentral:standards code-standards/comments.md.
    ...sonarjs.configs.recommended,
    rules: {
      ...sonarjs.configs.recommended.rules,
      "no-inline-comments": [
        "error",
        {
          ignorePattern:
            "eslint-|@ts-|prettier-|c8 |istanbul |webpackChunkName",
        },
      ],
      "sonarjs/no-commented-code": "error",
      // Duplicates @typescript-eslint/no-unused-vars above, which already
      // covers every .ts/.tsx file — but sonarjs's version takes no options,
      // so it can't recognize this project's `^_`-prefix "intentionally
      // unused" convention and flags those as real findings.
      "sonarjs/no-unused-vars": "off",
    },
  },
  {
    // JSX list rendering and functional array-chaining (.flatMap/.map/.filter
    // callbacks passed inline) routinely nest 4-5 arrow functions deep for
    // straightforward one-line callbacks — sonarjs/no-nested-functions is
    // tuned for deep *imperative* nesting and false-positives heavily on this
    // idiomatic React/functional style (verified: every real .tsx finding
    // from a first full-recommended run was exactly this shape, not a
    // genuine complexity problem).
    files: ["**/*.tsx"],
    plugins: { sonarjs: sonarjsPlugin },
    rules: {
      "sonarjs/no-nested-functions": "off",
    },
  },
  {
    // House convention: no em dash in user-facing copy. Scoped to JSXText,
    // copy-carrying JSX attrs, and toast calls — not every string literal,
    // which would flag internal log/error text out of scope here.
    files: ["**/*.tsx"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.stories.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXText[value=/\\u2014/]",
          message: "No em dash in user-facing text — use a period or comma.",
        },
        {
          selector:
            "JSXAttribute[name.name=/^(aria-label|title|placeholder|label|content|description)$/] > Literal[value=/\\u2014/]",
          message: "No em dash in user-facing text — use a period or comma.",
        },
        {
          selector:
            "CallExpression[callee.object.name='toast'] Literal[value=/\\u2014/]",
          message: "No em dash in user-facing text — use a period or comma.",
        },
      ],
    },
  },
  {
    // Tests and one-off scripts routinely label table-driven cases and
    // fixtures with short trailing notes; that reads better inline, so the
    // gate would be pure noise there.
    files: ["**/*.test.{ts,tsx}", "**/test/**", "scripts/**", "e2e/**"],
    plugins: { sonarjs: sonarjsPlugin },
    rules: {
      "no-inline-comments": "off",
      // Test fixtures routinely nest mocks/describe/it callbacks past
      // sonarjs's 4-level threshold (vi.mock -> describe -> it -> callback is
      // already 4) — a real code-smell signal for imperative app logic, pure
      // noise for test structure.
      "sonarjs/no-nested-functions": "off",
      // Fake IP (1.2.3.4) / password fixtures for rate-limit and auth test
      // mocks, and scripts/demo's fixed local-only demo seed identity — none
      // are real credentials or configuration.
      "sonarjs/no-hardcoded-ip": "off",
      "sonarjs/no-hardcoded-passwords": "off",
      // Math.random() here only generates a unique test-fixture id, not a
      // security-sensitive value.
      "sonarjs/pseudo-random": "off",
    },
  },
  {
    // scripts/demo/* explicitly documents "ffmpeg + ffprobe on PATH" as a
    // prerequisite (same as requiring `git`/`node` on PATH) — a local
    // developer-run tool, never deployed or reachable from user input, so
    // sonarjs's PATH-hijack concern (an attacker planting a binary earlier in
    // PATH) doesn't apply.
    files: ["scripts/**"],
    plugins: { sonarjs: sonarjsPlugin },
    rules: {
      "sonarjs/no-os-command-from-path": "off",
    },
  },
];

export default eslintConfig;
