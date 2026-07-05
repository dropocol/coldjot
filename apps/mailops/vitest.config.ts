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
    include: ["src/__tests__/**/*.test.ts"],
    // Characterization tests mock @coldjot/database and googleapis at the
    // module level; we don't want Vitest's real file-watching or coverage
    // gating yet (coverage lands in Phase 7).
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**", "src/**/*.d.ts"],
    },
  },
});
