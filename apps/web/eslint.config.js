// ESLint flat config — shared via @coldjot/eslint-config (Next.js preset).
// Carries the strict `error`-level rules the app already enforces (plan 08).
import { next } from "@coldjot/eslint-config";

export default [
  ...next(),

  // Pin the TS project root for the @typescript-eslint parser. In this monorepo
  // both apps/web and apps/mailops look like candidate tsconfigRootDirs, so
  // without this the parser can't disambiguate (and the VS Code ESLint extension
  // surfaces a "multiple candidate TSConfigRootDirs" parsing error). Each app
  // pins its own.
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        project: "./tsconfig.json",
      },
    },
  },
];
