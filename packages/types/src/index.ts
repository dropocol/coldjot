/**
 * Root barrel — re-exports TYPES ONLY (no zod schemas, no zod side-effects).
 *
 * For schemas, import from `@coldjot/types/schemas` (or per-domain subpaths).
 */

// Enums
export * from "./enums";

// Domain types
export * from "./common";
export * from "./user";
export * from "./contact";
export * from "./list";
export * from "./template";
export * from "./sequence";
export * from "./mailbox";
export * from "./gmail";
export * from "./email";
export * from "./events";
export * from "./thread";
export * from "./queue";
export * from "./search";
export * from "./watch";
export * from "./pubsub";
export * from "./placeholders";
export * from "./app-url";
