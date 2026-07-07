import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    // lib/env validates the public Supabase vars at import; any test that
    // transitively pulls in the client chain (mocked or not) needs them present
    // so env.ts doesn't throw. Dummy values — tests mock the actual client.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-anon-key",
    },
    passWithNoTests: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.{test,spec}.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "**/index.ts"],
    },
  },
});
