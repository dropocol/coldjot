import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: {
    compilerOptions: {
      incremental: false,
    },
  },
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  sourcemap: true,
  target: "node20",
});
