import { Queue, Worker } from "bullmq";
import { redis } from "@coldjot/redis";
import { logger } from "@/lib/log";
import { syncListToSequences } from "../jobs/list-sync-job";

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

// Function to add a job to the queue
export async function queueListSync(listId: string) {
  try {
    const job = await listSyncQueue.add("sync-list", { listId });
    logger.info({ jobId: job.id, listId }, "List sync job queued");
    return job;
  } catch (error) {
    logger.error({ listId, error }, "Failed to queue list sync job");
    throw error;
  }
}
