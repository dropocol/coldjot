// ESLint flat config (ESLint 9+). Migrated from .eslintrc.json.
// Intentionally minimal ruleset ported from the legacy config; TS-aware
// parsing now wired via @typescript-eslint (was absent before).
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "**/*.js", "**/*.cjs"],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parser: tsparser,
      globals: {
        // Node globals
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        clearImmediate: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
      },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      // Ported from the legacy .eslintrc.json
      "no-extra-semi": "warn",
      "no-cond-assign": "error",
      "no-constant-condition": "warn",
      "no-debugger": "error",
      "no-dupe-keys": "error",
      "no-unreachable": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
];
