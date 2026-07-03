/**
 * @coldjot/eslint-config — base flat config.
 *
 * Shared across every workspace. Wraps the @typescript-eslint parser +
 * recommended ruleset and the common hygiene rules. App/package-specific
 * presets (Next.js, React hooks) live in ./next.ts; pure-TS packages can
 * import this base directly via ./types.ts.
 *
 * Returns a function so consumers can spread the result and append their
 * own config objects — ESLint flat configs are plain arrays.
 */
import tseslint from "typescript-eslint";

export function base() {
  return tseslint.config(
    {
      ignores: ["dist/**", "node_modules/**", ".next/**", ".turbo/**"],
    },
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
        parserOptions: {
          ecmaFeatures: { jsx: true },
        },
      },
      extends: [
        ...tseslint.configs.recommended,
      ],
      rules: {
        // Hygiene — kept at warn so packages/apps can upgrade per-app.
        // (web upgrades these to error in ./next.ts to match plan 08.)
        "@typescript-eslint/no-unused-vars": [
          "warn",
          {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
            caughtErrorsIgnorePattern: "^_",
            destructuredArrayIgnorePattern: "^_",
          },
        ],
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/no-require-imports": "warn",
        "@typescript-eslint/no-empty-object-type": "warn",
        "no-useless-catch": "warn",
        "no-empty": ["warn", { allowEmptyCatch: true }],
        "no-dupe-else-if": "warn",
        "prefer-const": "warn",
        "preserve-caught-error": "warn",

        // Common-sense correctness rules (kept from the legacy mailops config).
        "no-cond-assign": "error",
        "no-constant-condition": "warn",
        "no-debugger": "error",
        "no-dupe-keys": "error",
        "no-unreachable": "error",
        "use-isnan": "error",
        "valid-typeof": "error",

        // Rules added by switching to typescript-eslint `recommended` that the
        // apps have pre-existing violations in. Downgraded to warn so the
        // config consolidation is behavior-preserving; clean up + upgrade to
        // error per-app later.
        "@typescript-eslint/no-non-null-asserted-optional-chain": "warn",
        "@typescript-eslint/no-unused-expressions": "warn",
        "@typescript-eslint/no-unsafe-declaration-merging": "warn",
      },
    }
  );
}

export default base;

// Re-export the preset entry points from the package root so consumers can
// `import { next, types } from "@coldjot/eslint-config"` without a subpath.
export { next } from "./next";
export { types } from "./types";
