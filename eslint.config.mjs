import next from "eslint-config-next";
import sonarjs from "eslint-plugin-sonarjs";

// next's default export already registers @typescript-eslint (as the
// "next/typescript" block) — reuse that instance rather than adding a
// second direct dependency on @typescript-eslint/eslint-plugin.
const typescriptEslintPlugin = next.find((c) => c.name === "next/typescript")
  .plugins["@typescript-eslint"];

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
    // Comment hygiene (templateCentral standard, hard gate as of 5.8): own-line
    // comments only, no commented-out code. See
    // templatecentral:standards code-standards/comments.md.
    plugins: { sonarjs },
    rules: {
      "no-inline-comments": [
        "error",
        {
          ignorePattern:
            "eslint-|@ts-|prettier-|c8 |istanbul |webpackChunkName",
        },
      ],
      "sonarjs/no-commented-code": "error",
    },
  },
  {
    // Tests and one-off scripts routinely label table-driven cases and
    // fixtures with short trailing notes; that reads better inline, so the
    // gate would be pure noise there.
    files: ["**/*.test.{ts,tsx}", "**/test/**", "scripts/**", "e2e/**"],
    rules: {
      "no-inline-comments": "off",
    },
  },
];

export default eslintConfig;
