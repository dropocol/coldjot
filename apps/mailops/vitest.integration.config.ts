/**
 * Integration-tier vitest config (Phase 7.8). Runs ONLY the `integration/`
 * suite — the slow tests that hit a real Postgres test DB.
 *
 * Invoked via `npm run test:integration -w mailops` (which sets
 * `DATABASE_URL_TEST` and passes `--config vitest.integration.config.ts`).
 *
 * mailops v2: the `repositories/` glob is gone — that layer was deleted and
 * its query logic now lives as Prisma `$extends` domain methods, exercised
 * end-to-end by the `integration/` suites against a real Postgres.
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
      "src/__tests__/integration/**/*.test.ts",
    ],
    // All integration files share one test DB; run them sequentially (no file
    // parallelism) so a suite's truncate/seed isn't raced by another. Each
    // suite's beforeEach truncates the tables it touches.
    fileParallelism: false,
    pool: "forks",
    // No coverage gate on the slow tier (covered by the fast tier's gate).
    coverage: { enabled: false },
  },
});
