import { Queue, Job } from "bullmq";
import { BaseProcessor } from "../base-processor";
import { logger } from "@/lib/log";
import { prisma } from "@coldjot/database";
import { getWorkerOptions } from "@/config";
import { QUEUE_NAMES } from "@/config";
import { syncListToSequences } from "./helper";

interface ListSyncJob {
  type: "SYNC_LISTS";
}

export class ListSyncProcessor extends BaseProcessor<ListSyncJob> {
  private readonly SCHEDULER_ID = "list-sync-scheduler";
  private readonly CHECK_INTERVAL = 5000; // 5 seconds

  constructor(queue: Queue) {
    super(
      queue,
      QUEUE_NAMES.LIST_SYNC,
      getWorkerOptions(QUEUE_NAMES.LIST_SYNC)
    );
    logger.info("📋 List Sync Processor initialized");
    this.setupListSyncScheduler();
  }

  private async setupListSyncScheduler(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        this.SCHEDULER_ID,
        { every: this.CHECK_INTERVAL },
        {
          name: "sync-lists",
          data: { type: "SYNC_LISTS" },
          opts: {
            removeOnComplete: true,
            removeOnFail: true,
          },
        }
      );
      logger.info(
        `📋 List sync scheduler initialized with ${this.CHECK_INTERVAL}ms interval`
      );
    } catch (error) {
      logger.error("📋 ❌ Failed to setup list sync scheduler:", error);
      throw error;
    }
  }

  protected async process(job: Job<ListSyncJob>): Promise<void> {
    try {
      await this.processSyncRecords();
    } catch (error) {
      logger.error(`📋 ❌ Failed to process list sync job ${job.id}:`, error);
      throw error;
    }
  }

  private async processSyncRecords(): Promise<void> {
    try {
      logger.info("📋 Starting list sync processing");

      const syncRecords = await prisma.listSyncRecord.findMany({
        where: { status: "pending" },
        orderBy: { createdAt: "asc" },
        take: 10,
      });

      if (syncRecords.length === 0) return;

      logger.info(`📋 Found ${syncRecords.length} sync records to process`);

      for (const record of syncRecords) {
        try {
          await prisma.listSyncRecord.update({
            where: { id: record.id },
            data: { status: "processing" },
          });

          await syncListToSequences(record.listId);

          await prisma.listSyncRecord.update({
            where: { id: record.id },
            data: { status: "completed" },
          });

          logger.info(`📋 Processed list sync record ${record.id}`);
        } catch (error) {
          logger.error(
            `📋 ❌ Error processing sync record ${record.id}:`,
            error
          );
          await prisma.listSyncRecord.update({
            where: { id: record.id },
            data: {
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }

      logger.info("📋 ✅ Completed list sync processing");
    } catch (error) {
      logger.error(error, "📋 ❌ Error in processSyncRecords:");
      throw error;
    }
  }
}
