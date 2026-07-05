/**
 * Integration-tier vitest config (Phase 7.8). Runs ONLY the `repositories/`
 * and `integration/` suites — the slow tests that hit a real Postgres test DB.
 *
 * Invoked via `npm run test:integration -w mailops` (which sets
 * `DATABASE_URL_TEST` and passes `--config vitest.integration.config.ts`).
 */
import { defineConfig } from "vitest/config";
import path from "node:path";

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
    // Only the DB-backed suites.
    include: [
      "src/__tests__/repositories/**/*.test.ts",
      "src/__tests__/integration/**/*.test.ts",
    ],
    // No coverage gate on the slow tier (covered by the fast tier's gate).
    coverage: { enabled: false },
  },
});
