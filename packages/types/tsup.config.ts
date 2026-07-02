import { defineConfig } from "tsup";

// https://github.com/vercel/turborepo/discussions/1347
export default defineConfig({
  clean: false,
  dts: {
    compilerOptions: {
      incremental: false,
      ignoreDeprecations: "6.0",
    },
  },
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  sourcemap: true,
  target: "node20",
});
