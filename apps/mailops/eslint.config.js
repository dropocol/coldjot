// ESLint flat config — shared via @coldjot/eslint-config.
import { base } from "@coldjot/eslint-config";

export default [
  ...base(),

  // mailops v2: the repository layer is gone. `@coldjot/database` (the extended
  // Prisma client + its `$extends` domain methods) IS the sanctioned data-access
  // layer now, so there is no longer any reason to keep it out of non-repo
  // files — the old "Prisma belongs only in repositories/prisma/" restriction
  // (from the Phase 1 mailops refactor) was removed with the repository layer.
];
