import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: {
    compilerOptions: {
      incremental: false,
      ignoreDeprecations: "6.0",
    },
  },
  entry: ["src/index.ts", "src/next.ts", "src/types.ts"],
  format: ["esm"],
  sourcemap: true,
  target: "node20",
  splitting: true,
  treeshake: true,
  platform: "node",
  external: [
    "eslint",
    "typescript-eslint",
    "@typescript-eslint/eslint-plugin",
    "@typescript-eslint/parser",
    "@next/eslint-plugin-next",
    "eslint-plugin-react-hooks",
  ],
});
