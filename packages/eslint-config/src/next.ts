/**
 * @coldjot/eslint-config — Next.js preset.
 *
 * For React/Next apps (apps/web, apps/marketing, future admin panel).
 * Extends base() with @next/eslint-plugin-next (core-web-vitals) and
 * eslint-plugin-react-hooks, and upgrades the hygiene rules to `error`
 * to match the strictness apps already enforce (plan 08).
 *
 * Why not use eslint-config-next? It depends on @rushstack/eslint-patch,
 * which is incompatible with ESLint 10. Using the plugin directly avoids
 * that. (`next lint` is removed in Next 16 anyway.)
 */
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import { base } from "./index";

export function next() {
  return tseslint.config(
    ...base(),
    // Re-apply the typescript-eslint recommended configs so the upgraded
    // rule values below resolve their @typescript-eslint plugin correctly.
    // (Flat config requires a plugin to be present in the config chain
    // before its rules can be overridden in a later config object.)
    ...tseslint.configs.recommended,
    {
      // Next.js + react-hooks plugins + their recommended/core-web-vitals rules.
      plugins: {
        "@next/next": nextPlugin,
        "react-hooks": reactHooks,
      },
      rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs["core-web-vitals"].rules,
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "error",
      },
    },
    {
      // Hygiene rules upgraded warn → error to match the app's bar (plan 08).
      files: ["**/*.{ts,tsx}"],
      rules: {
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
            caughtErrorsIgnorePattern: "^_",
            destructuredArrayIgnorePattern: "^_",
          },
        ],
        "@typescript-eslint/no-require-imports": "error",
        "@typescript-eslint/no-empty-object-type": "error",
        "no-useless-catch": "error",
        "no-empty": "error",
        "no-dupe-else-if": "error",
        "prefer-const": "error",
        "preserve-caught-error": "error",
        "no-control-regex": "warn",

        // Disabled — not useful for this app.
        "react/no-unescaped-entities": "off",
        "@next/next/no-html-link-for-pages": "off",
      },
    }
  );
}

export default next;
