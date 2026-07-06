/**
 * Domain Prisma extension — composed entry point.
 *
 * The actual methods live in per-aggregate files under `./domain-extensions/`:
 *   - sequence.ts  (sequence, businessHours, sequenceStep, sequenceContact, sequenceMailbox)
 *   - email.ts     (emailTracking, emailEvent, trackedLink)
 *   - inbox.ts     (mailbox, emailWatch, emailWatchHistory, processedMessage, emailThread)
 *
 * Each aggregate file exports a plain `{ [model]: {...} }` object — NOT a
 * `Prisma.defineExtension`. This file merges all of them into a SINGLE
 * `Prisma.defineExtension`, which is what gets `$extends`-ed onto the Prisma
 * client alongside the token-encryption extension in `index.ts`.
 *
 * Why one defineExtension and not a `$extends` chain? Prisma only emits
 * model-extension methods into the generated `.d.ts` when every model lives in
 * a single extension. Chaining several model-bearing extensions via
 * `$extends()` collapses the emitted `model` type to `{}`, which breaks
 * downstream typechecks (e.g. mailops consuming the built `@coldjot/database`
 * types). Merging into one extension is the supported shape; Prisma has no
 * merge helper, so we spread the model blocks here.
 *
 * Adding a new method: open the relevant aggregate file and drop it under the
 * right `model` block. Use `Prisma.getExtensionContext(this)` to get the typed
 * Prisma delegate for the current model. Cast to a domain record type from
 * `@coldjot/types` when the row needs narrowing.
 */
import { Prisma } from "@prisma/client";
import { sequenceModels } from "./domain-extensions/sequence";
import { emailModels } from "./domain-extensions/email";
import { inboxModels } from "./domain-extensions/inbox";

export const domainExtension = Prisma.defineExtension({
  name: "domain",
  model: {
    ...sequenceModels,
    ...emailModels,
    ...inboxModels,
  },
});
