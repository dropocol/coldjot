import { prisma } from "@coldjot/database";
import { logger } from "@/lib/log";
import { syncListToSequences } from "./list-sync";

export class ListSyncWatcher {
  private static instance: ListSyncWatcher;
  private interval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private checkIntervalMs = 5000; // 5 seconds (reduced from 10 seconds for better responsiveness)

  private constructor() {}

  public static getInstance(): ListSyncWatcher {
    if (!ListSyncWatcher.instance) {
      ListSyncWatcher.instance = new ListSyncWatcher();
    }
    return ListSyncWatcher.instance;
  }

  public start(): void {
    if (this.interval) {
      return;
    }

    logger.info("Starting list sync watcher");
    this.interval = setInterval(
      () => this.checkForNewSyncs(),
      this.checkIntervalMs
    );
  }

  public stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info("Stopped list sync watcher");
    }
  }

  private async checkForNewSyncs(): Promise<void> {
    // if (this.isRunning) {
    //   return;
    // }

    try {
      this.isRunning = true;
      logger.info("Checking for new list syncs");

      // Find completed sync records that haven't been processed
      const syncRecords = await prisma.listSyncRecord.findMany({
        where: {
          status: "completed",
        },
        orderBy: {
          createdAt: "asc",
        },
        take: 10, // Process in batches
      });

      logger.info({ syncRecords }, "Found list sync records to process");

      if (syncRecords.length === 0) {
        return;
      }

      logger.info({ syncRecords }, "Found list sync records to process");

      logger.info(`Found ${syncRecords.length} list sync records to process`);

      // Process each sync record
      for (const record of syncRecords) {
        try {
          // Update status to processing
          await prisma.listSyncRecord.update({
            where: { id: record.id },
            data: { status: "processing" },
          });

          // Process the sync
          await syncListToSequences(record.listId);

          // Update status to processed
          await prisma.listSyncRecord.update({
            where: { id: record.id },
            data: { status: "processed" },
          });

          logger.info(`Processed list sync record ${record.id}`);
        } catch (error) {
          logger.error(
            { error, recordId: record.id },
            "Error processing list sync record"
          );

          // Update status to failed
          await prisma.listSyncRecord.update({
            where: { id: record.id },
            data: {
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }
    } catch (error) {
      logger.error({ error }, "Error checking for new list syncs");
    } finally {
      this.isRunning = false;
    }
  }
}
