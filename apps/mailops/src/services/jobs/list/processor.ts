import { Queue, Job } from "bullmq";
import { BaseProcessor } from "../base-processor";
import { logger } from "@/lib/log";
import { prisma } from "@coldjot/database";
import { getWorkerOptions, getRateLimits } from "@/config";
import { QUEUE_NAMES } from "@/config";
import { syncListToSequences } from "./helper";
import pLimit from "p-limit";

interface ListSyncJob {
  type: "SYNC_LISTS";
}

export class ListSyncProcessor extends BaseProcessor<ListSyncJob> {
  private readonly SCHEDULER_ID = "list-sync-scheduler";
  private readonly CHECK_INTERVAL = 30000; // 5 seconds
  private readonly MAX_CONCURRENT_SYNCS = 3; // Maximum number of concurrent syncs
  private readonly concurrencyLimit: pLimit.Limit;
  private readonly db = prisma;

  constructor(
    queue: Queue,
    dlQueues: Map<string, Queue> = new Map()
  ) {
    super(
      queue,
      QUEUE_NAMES.LIST_SYNC,
      getWorkerOptions(QUEUE_NAMES.LIST_SYNC),
      dlQueues
    );

    // Initialize concurrency limiter
    this.concurrencyLimit = pLimit(this.MAX_CONCURRENT_SYNCS);

    logger.info({
      checkInterval: this.CHECK_INTERVAL,
      maxConcurrentSynCS: this.MAX_CONCURRENT_SYNCS,
    }, "📋 List Sync Processor initialized");

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
      logger.error({ err: error }, "📋 ❌ Failed to setup list sync scheduler");
      throw error;
    }
  }

  protected async process(job: Job<ListSyncJob>): Promise<void> {
    try {
      await this.processSyncRecords();
    } catch (error) {
      logger.error({ err: error }, `📋 ❌ Failed to process list sync job ${job.id}`);
      throw error;
    }
  }

  private async processSyncRecords(): Promise<void> {
    try {
      logger.info("📋 Starting list sync processing");

      // Find all pending sync records
      const syncRecords = await this.db.listSyncRecord.findPending(10);

      if (syncRecords.length === 0) return;

      logger.info(`📋 Found ${syncRecords.length} sync records to process`);

      // Sort records by contact count to process smaller lists first
      const sortedRecords = syncRecords.sort(
        (a, b) => (a.list._count.contacts || 0) - (b.list._count.contacts || 0)
      );

      // Process records concurrently with limits
      await Promise.all(
        sortedRecords.map((record) =>
          this.concurrencyLimit(async () => {
            try {
              await this.db.listSyncRecord.updateStatus(record.id, {
                status: "processing",
              });

              await syncListToSequences(record.listId);

              await this.db.listSyncRecord.updateStatus(record.id, {
                status: "completed",
              });

              logger.info(`📋 Processed list sync record ${record.id}`);
            } catch (error) {
              logger.error({ err: error }, `📋 ❌ Error processing sync record ${record.id}`);
              await this.db.listSyncRecord.updateStatus(record.id, {
                status: "failed",
                error: error instanceof Error ? error.message : String(error),
              });
            }
          })
        )
      );

      logger.info("📋 ✅ Completed list sync processing");
    } catch (error) {
      logger.error(error, "📋 ❌ Error in processSyncRecords:");
      throw error;
    }
  }
}
