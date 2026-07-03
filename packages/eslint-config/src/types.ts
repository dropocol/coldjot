/**
 * @coldjot/eslint-config — pure-TypeScript preset.
 *
 * For packages/* with no React (types, database, eslint-config itself).
 * Currently identical to base(); re-exported as its own entry point so
 * packages can opt into a stricter/no-React ruleset later without touching
 * the apps.
 */
import { base } from "./index";

export const types = base;
export default base;
