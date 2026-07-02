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
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-require-imports": "warn",
      // Pre-existing patterns in the codebase; Plan 08 phases these to error.
      "no-useless-catch": "warn",
      "no-control-regex": "warn",
      "no-empty": "warn",
      "no-dupe-else-if": "warn",
      "prefer-const": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "preserve-caught-error": "warn",
      "react/no-unescaped-entities": "off",
      "@next/next/no-html-link-for-pages": "off",
    },
  }
);
