/**
 * One-time helper: record real Gmail API responses into a fixture file so the
 * adapter tests (`__tests__/unit/adapters/gmail-transport.test.ts`) can replay
 * them instead of using hand-built synthetic payloads.
 *
 * NOT run in CI. Run this manually once against the dev Gmail account, then
 * commit the resulting JSON. The adapter test's assertion shapes stay identical
 * — only the input fixtures change from synthetic → recorded.
 *
 * Usage (from the repo root, with dev Gmail credentials in env):
 *
 *   npm run record:gmail-fixtures        # after wiring the script below
 *
 * Prerequisites:
 *   - A mailbox row in the dev DB with valid OAuth tokens (run through the app's
 *     Gmail OAuth flow once).
 *   - DATABASE_URL pointing at the dev DB.
 *   - GOOGLE_CLIENT_ID_EMAIL / GOOGLE_SECRET_EMAIL / GOOGLE_REDIRECT_URI_EMAIL set.
 *
 * Output: apps/mailops/src/__tests__/unit/adapters/gmail-transport.fixture.json
 *
 * Phase 7.4: this is the documented upgrade path. The existing synthetic
 * fixtures are correct (built from the gmail_v1 schema); recorded fixtures add
 * real-world header/edge-case coverage. Swapping is a one-line change in the
 * adapter test (import the JSON, feed it to the same assertions).
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// NOTE: this script is intentionally not wired into package.json's scripts by
// default — it needs live Gmail credentials and a dev DB. To run it:
//   cd apps/mailops && npx tsx scripts/record-gmail-fixtures.ts
// Uncomment + fill in the orchestration below before running.

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(
    __dirname,
    "..",
    "src",
    "__tests__",
    "unit",
    "adapters",
    "gmail-transport.fixture.json"
  );

  // 1. Load the mailbox (dev DB) with valid tokens.
  // 2. Build a GmailClientService → getClient(userId, mailboxId).
  // 3. Send a test message; capture gmail.users.messages.send response.
  // 4. get the sent message; capture gmail.users.messages.get response.
  // 5. insert an untracked copy; capture the insert response.
  // 6. delete the original; capture (void).
  // 7. Write { send, get, insert } to outPath as JSON.

  console.log(
    [
      "record-gmail-fixtures: this is a one-time, manual, live-Gmail script.",
      "",
      "Before running, fill in the orchestration in this file (steps 1–7).",
      "Output target: " + outPath,
      "",
      "The recorded JSON replaces the synthetic fixtures in",
      "  __tests__/unit/adapters/gmail-transport.test.ts",
      "with identical assertion shapes but real Gmail payload edges.",
    ].join("\n")
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Suppress the "unused import" lint for writeFileSync — it's used once the
// orchestration above is filled in.
void writeFileSync;
