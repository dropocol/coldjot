// ESLint flat config (ESLint 9+). Uses @next/eslint-plugin-next directly
// instead of eslint-config-next (which depends on @rushstack/eslint-patch,
// incompatible with ESLint 10). `next lint` is deprecated in 15.5+ and
// removed in 16; this config lets `eslint .` work directly.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [".next/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "@next/next": nextPlugin, "react-hooks": reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // Hygiene rules — backlog driven to zero; now enforced.
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

      // Correctness / bug-catching rules — now at zero violations, enforced.
      // rules-of-hooks is unconditional correctness; exhaustive-deps is now at
      // zero violations (one-shot/mount effects suppressed inline with rationale).
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "@typescript-eslint/no-require-imports": "error",
      "no-useless-catch": "error",
      "no-empty": "error",
      "no-dupe-else-if": "error",
      "prefer-const": "error",
      "@typescript-eslint/no-empty-object-type": "error",
      "preserve-caught-error": "error",

      // One legitimate control-char range (MIME ASCII boundary); suppressed inline.
      "no-control-regex": "warn",

      "react/no-unescaped-entities": "off",
      "@next/next/no-html-link-for-pages": "off",
    },
  }
);
