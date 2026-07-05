// ESLint flat config — shared via @coldjot/eslint-config.
import { base } from "@coldjot/eslint-config";

export default [
  ...base(),

  // Phase 1 (mailops refactor): keep Prisma out of non-repository files.
  // Rule is "warn" in Phase 1 (existing code still imports prisma everywhere);
  // Phase 3 promotes it to "error" as call sites migrate to the repository
  // interfaces. See plans/mailops-refactor/phase-1-seams-composition-root.md §1.6.
  {
    files: ["src/**/*.ts"],
    ignores: [
      "src/repositories/prisma/**",
      "src/composition-root.ts",
      "src/__tests__/**",
    ],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          paths: [
            {
              name: "@coldjot/database",
              message:
                "Import the repository interface instead. Prisma access belongs only in repositories/prisma/.",
            },
          ],
        },
      ],
    },
  },
];
