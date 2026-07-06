// ESLint flat config — shared via @coldjot/eslint-config.
import { base } from "@coldjot/eslint-config";

export default [
  ...base(),

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

  // mailops v2: the repository layer is gone. `@coldjot/database` (the extended
  // Prisma client + its `$extends` domain methods) IS the sanctioned data-access
  // layer now, so there is no longer any reason to keep it out of non-repo
  // files — the old "Prisma belongs only in repositories/prisma/" restriction
  // (from the Phase 1 mailops refactor) was removed with the repository layer.
];

