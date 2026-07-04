/**
 * Placeholder context shared by web + mailops.
 *
 * Generic over the contact shape so each app can parameterize it with the
 * `Contact` type it uses (Prisma model in both apps today) without forcing
 * this package to depend on Prisma:
 *
 *   import type { PlaceholderContext } from "@coldjot/types";
 *   import type { Contact } from "@coldjot/database";
 *   type C = PlaceholderContext<Contact>;
 */
export interface PlaceholderContext<TContact = Record<string, unknown>> {
  contact?: TContact | null;
  fallbacks?: Record<string, string>;
  customValues?: Record<string, string>;
}
