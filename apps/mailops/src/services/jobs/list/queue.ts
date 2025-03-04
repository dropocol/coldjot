import { Queue, Worker } from "bullmq";
import { RedisConnection } from "@/services/shared/redis/connection";
import { logger } from "@/lib/log";
import { syncListToSequences } from "./list-sync";

// Get Redis client
const redis = RedisConnection.getInstance().getClient();

// Define the job data interface
interface ListSyncJobData {
  listId: string;
}

// Create the queue
export const listSyncQueue = new Queue<ListSyncJobData>("list-sync", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: 100,
  },
});

// Create the worker
export const listSyncWorker = new Worker<ListSyncJobData>(
  "list-sync",
  async (job) => {
    const { listId } = job.data;
    logger.info({ jobId: job.id, listId }, "Processing list sync job");

    try {
      await syncListToSequences(listId);
      return { success: true };
    } catch (error) {
      logger.error({ jobId: job.id, listId, error }, "List sync job failed");
      throw error;
    }
  },
  { connection: redis, concurrency: 5 }
);

// Handle worker events
listSyncWorker.on("completed", (job) => {
  logger.info(
    { jobId: job?.id, listId: job?.data.listId },
    "List sync job completed"
  );
});

listSyncWorker.on("failed", (job, error) => {
  logger.error(
    { jobId: job?.id, listId: job?.data.listId, error },
    "List sync job failed"
  );
});
