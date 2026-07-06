/**
 * Integration test — PubSub large history-gap handling.
 *
 * Phase 7.7 flow 7 (Group C): when the gap between the watch's last historyId
 * and the notification's historyId exceeds the threshold (>10000), the pipeline
 * skips message processing, advances the watch's historyId, and writes a
 * HISTORY_GAP record into EmailWatchHistory. Exercises InboxSyncServiceImpl →
 * real Prisma repos → real DB with a FakeInboxSource (the gap path never calls
 * fetchHistory, so the fake is barely used).
 *
 * Replaces the Group C "huge history gap" characterization case.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { InboxSyncServiceImpl } from "@/services/domain/inbox-sync.service";
import { FakeInboxSource } from "../helpers/fakes";
import { PrismaMailboxRepository } from "@/repositories/prisma/prisma-mailbox.repo";
import { PrismaEmailWatchRepository } from "@/repositories/prisma/prisma-email-watch.repo";
import { PrismaEmailWatchHistoryRepository } from "@/repositories/prisma/prisma-email-watch-history.repo";
import { PrismaProcessedMessageRepository } from "@/repositories/prisma/prisma-processed-message.repo";
import { PrismaEmailThreadRepository } from "@/repositories/prisma/prisma-email-thread.repo";
import { PrismaSequenceContactRepository } from "@/repositories/prisma/prisma-sequence-contact.repo";
import { PrismaEmailEventRepository } from "@/repositories/prisma/prisma-email-event.repo";
import { seedUser, seedMailbox } from "../helpers/seed";

const SCOPE = "it-gap";
let USER_ID: string;
let WATCH_ID: string;
const EMAIL = `${SCOPE}@example.com`;

const service = new InboxSyncServiceImpl(
  new PrismaMailboxRepository(),
  new PrismaEmailWatchRepository(),
  new PrismaEmailWatchHistoryRepository(),
  new PrismaProcessedMessageRepository(),
  new PrismaEmailThreadRepository(),
  new PrismaSequenceContactRepository(),
  new PrismaEmailEventRepository(),
  new FakeInboxSource()
);

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  USER_ID = `${SCOPE}-user`;
  WATCH_ID = `${SCOPE}-watch`;
  await seedUser(USER_ID);
  await seedMailbox(`${SCOPE}-mbox`, USER_ID, EMAIL);
  await prisma.emailWatch.upsert({
    where: { id: WATCH_ID },
    update: {},
    create: {
      id: WATCH_ID,
      userId: USER_ID,
      email: EMAIL,
      // A small historyId; the notification will be >10000 ahead → large gap.
      historyId: "100",
      expiration: new Date(2030, 0, 1),
    },
  });
});

beforeEach(async () => {
  await prisma.emailWatchHistory.deleteMany({ where: { emailWatchId: WATCH_ID } });
  await prisma.emailWatch.update({
    where: { id: WATCH_ID },
    data: { historyId: "100" },
  });
});

describe("pubsub large history gap (InboxSyncServiceImpl vs real DB)", () => {
  it("a huge gap advances the watch historyId + writes a HISTORY_GAP record, no message processing", async () => {
    // Notification historyId is 50000 ahead of the watch's 100 → large gap.
    await service.handleNotification({
      messageId: "gap-msg-1",
      publishTime: new Date().toISOString(),
      data: Buffer.from(
        JSON.stringify({
          emailAddress: EMAIL,
          historyId: "50000",
        })
      ).toString("base64"),
    } as any);

    // The watch's historyId advanced to the notification's.
    const watch = await prisma.emailWatch.findUnique({ where: { id: WATCH_ID } });
    expect(watch?.historyId).toBe("50000");

    // A HISTORY_GAP record was written.
    const gapRecord = await prisma.emailWatchHistory.findFirst({
      where: { emailWatchId: WATCH_ID, notificationType: "HISTORY_GAP" },
    });
    expect(gapRecord).not.toBeNull();
    expect((gapRecord!.data as any)?.gapSize).toBe(49900);
  });
});
