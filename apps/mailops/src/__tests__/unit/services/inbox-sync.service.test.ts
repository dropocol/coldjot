/**
 * Unit tests for InboxSyncServiceImpl (Group C — the pipeline shell).
 *
 * Phase 7.2: all 8 repos + the InboxSource adapter are constructor-injected
 * with fakes, and applyClassification's stats dep (Phase A2) is injected too.
 * Covers the pipeline's branching: no-watch skip, already-processed historyId
 * dedupe, and the large-history-gap fallback. The per-message classification
 * outcomes (reply/bounce/original/dedupe) are covered by the integration
 * `pubsub-classification` test against the real DB; here we isolate the
 * pipeline shell's control flow.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// applyClassification reaches updateSequenceStats; mock it so no Prisma touch.
vi.mock("@/lib/stats", () => ({ updateSequenceStats: vi.fn(async () => ({})) }));

import { InboxSyncServiceImpl } from "@/services/domain/inbox-sync.service";
import {
  FakeEmailThreadRepository,
  FakeProcessedMessageRepository,
  FakeEmailWatchRepository,
  FakeEmailWatchHistoryRepository,
  FakeMailboxRepository,
} from "@/__tests__/helpers/fakes/inbox-sync-repos.fake";
import {
  FakeSequenceContactRepository,
  FakeEmailEventRepository,
} from "@/__tests__/helpers/fakes";
import { FakeEmailTrackingRepository } from "@/__tests__/helpers/fakes";
import { FakeInboxSource } from "@/__tests__/helpers/fakes";

let mailboxRepo: FakeMailboxRepository;
let emailWatchRepo: FakeEmailWatchRepository;
let emailWatchHistoryRepo: FakeEmailWatchHistoryRepository;
let processedMessageRepo: FakeProcessedMessageRepository;
let emailThreadRepo: FakeEmailThreadRepository;
let sequenceContactRepo: FakeSequenceContactRepository;
let emailEventRepo: FakeEmailEventRepository;
let inboxSource: FakeInboxSource;
let service: InboxSyncServiceImpl;

const EMAIL = "watched@example.com";
const WATCH_ID = "watch-1";

beforeEach(() => {
  mailboxRepo = new FakeMailboxRepository();
  emailWatchRepo = new FakeEmailWatchRepository();
  emailWatchHistoryRepo = new FakeEmailWatchHistoryRepository();
  processedMessageRepo = new FakeProcessedMessageRepository();
  emailThreadRepo = new FakeEmailThreadRepository();
  sequenceContactRepo = new FakeSequenceContactRepository();
  emailEventRepo = new FakeEmailEventRepository();
  inboxSource = new FakeInboxSource();
  service = new InboxSyncServiceImpl(
    mailboxRepo,
    emailWatchRepo,
    emailWatchHistoryRepo,
    processedMessageRepo,
    emailThreadRepo,
    sequenceContactRepo,
    emailEventRepo,
    inboxSource
  );
});

/** Encode a PubSub message data payload (base64 JSON). */
function message(emailAddress: string, historyId: string) {
  return {
    messageId: `msg-${historyId}`,
    publishTime: new Date().toISOString(),
    data: Buffer.from(JSON.stringify({ emailAddress, historyId })).toString(
      "base64"
    ),
  } as any;
}

/** Seed the watch + mailbox a notification resolves to. */
async function seedWatch(historyId = "100") {
  // Use create() so the email secondary index is registered (findByEmail uses it).
  await emailWatchRepo.create({
    id: WATCH_ID,
    userId: "u1",
    email: EMAIL,
    historyId,
    expiration: new Date(2030, 0, 1),
  });
  // Mailbox is looked up via findWithEmailAliases → findByIndexed("email").
  mailboxRepo.store.set("mbox-1", {
    id: "mbox-1",
    userId: "u1",
    email: EMAIL,
    isActive: true,
    provider: "gmail",
    name: null,
    access_token: "tok",
    refresh_token: "ref",
    expires_at: 9999999999,
    providerAccountId: "acct",
    aliases: [],
  } as any);
  mailboxRepo.store.index("email", EMAIL, "mbox-1");
}

describe("[Group C] InboxSyncServiceImpl pipeline", () => {
  it("no-ops when no watch exists for the email address", async () => {
    await service.handleNotification(message("unknown@example.com", "200"));
    // No watch-history record written.
    expect(emailWatchHistoryRepo.calls.length).toBe(0);
  });

  it("writes a HISTORY_GAP record + advances the watch when the gap is huge", async () => {
    await seedWatch("100");
    inboxSource.accessToken = "tok"; // token refresh succeeds
    await service.handleNotification(message(EMAIL, "50000"));

    // Watch historyId advanced to the notification's.
    const watch = emailWatchRepo.store.get(WATCH_ID);
    expect(watch?.historyId).toBe("50000");

    // A HISTORY_GAP record was written.
    const gap = emailWatchHistoryRepo.calls.find(
      (c) => (c.args[0] as any)?.notificationType === "HISTORY_GAP"
    );
    expect(gap).toBeTruthy();
  });

  it("skips a historyId that was already processed (idempotency)", async () => {
    await seedWatch("100");
    // Mark historyId 200 as already processed.
    emailWatchHistoryRepo.store.set("hist-200", {
      id: "hist-200",
      emailWatchId: WATCH_ID,
      historyId: "200",
      notificationType: "MESSAGE",
      processed: true,
      data: {},
    } as any);

    await service.handleNotification(message(EMAIL, "200"));

    // No new history record created (the only one is the pre-seeded).
    const creates = emailWatchHistoryRepo.calls.filter((c) => c.method === "create");
    expect(creates.length).toBe(0);
  });
});
