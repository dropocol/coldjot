import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Two test tiers, split by directory (Phase 7.8):
 *   - `test`             (fast, no DB): unit + adapter + processor + the Phase 0
 *                         characterization suite. Runs on every push / save.
 *   - `test:integration` (slow, needs Postgres): the `repositories` and
 *                         `integration` suites, which hit a real test database.
 *
 * `npm test` runs this config's default include (the fast set). The integration
 * tier uses `vitest.integration.config.ts` (which inverts the exclude) and is
 * invoked by the `test:integration` script with `--config`.
 */
const FAST_EXCLUDE = [
  "src/__tests__/repositories/**", // need a DB (Phase 7.5)
  "src/__tests__/integration/**", // need a DB (Phase 7.7)
];

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/__tests__/**/*.test.ts"],
    exclude: FAST_EXCLUDE,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**", "src/**/*.d.ts"],
      // Coverage gate (Phase 7.8). Thresholds per the test-suite README's
      // coverage-targets table; enforced in CI via `test:coverage`.
      // Lines are the floor — raise, don't lower.
      thresholds: {
        lines: 80,
        perFile: false,
      },
    },
  },
});

