import { Queue, Job } from "bullmq";
import { BaseProcessor } from "../base-processor";
import { logger } from "@/lib/log";
import { prisma } from "@coldjot/database";
import {
  ThreadCheckData,
  EmailEventEnum,
  SequenceContactStatusEnum,
} from "@coldjot/types";
import { THREAD_CONFIG } from "@/config/thread/constants";
import { getWorkerOptions, getRateLimits } from "@/config";
import { GmailClientService } from "@/lib/google";
import { DateTime } from "luxon";
import type { MessagePartHeader } from "@coldjot/types";
import { updateSequenceStats } from "@/lib/stats";
import { QUEUE_NAMES } from "@/config";
import { Prisma } from "@prisma/client";
import pLimit from "p-limit";
import { RateLimiter } from "@/lib/rate-limiter";
import {
  extractEmailFromHeader,
  isBounceMessage,
  isSenderSequenceOwner,
  shouldProcessMessage,
} from "@/utils";
import { getSequenceMailboxId } from "@/lib/mailbox";

// Environment-specific configuration
type Environment = "DEVELOPMENT" | "PRODUCTION";
const CURRENT_ENV = (process.env.NODE_ENV?.toUpperCase() ||
  "DEVELOPMENT") as Environment;

// Use thread config constants
const { CHECK_FREQUENCIES, AGE_THRESHOLDS, BATCH, RETRY } = THREAD_CONFIG;

interface ThreadCheckJob {
  type: "CHECK_THREADS";
  batchSize?: number;
  priority?: number;
  userId: string;
  mailboxId: string;
  sequenceId?: string;
  threadAge?: "RECENT" | "MEDIUM" | "OLD" | "VERY_OLD";
}

interface ThreadStatus {
  isCompleted: boolean;
  lastActivity: Date | null;
  engagementLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH";
}

export class ThreadProcessor extends BaseProcessor<ThreadCheckJob> {
  private readonly SCHEDULER_ID = "thread-monitoring-scheduler";
  private readonly rateLimiter: RateLimiter;
  private readonly concurrencyLimiter: pLimit.Limit;

  constructor(queue: Queue) {
    super(
      queue,
      QUEUE_NAMES.THREAD_WATCHER,
      getWorkerOptions(QUEUE_NAMES.THREAD_WATCHER)
    );

    const rateLimits = getRateLimits(QUEUE_NAMES.THREAD_WATCHER);

    // Initialize rate limiter
    this.rateLimiter = new RateLimiter({
      maxPerSecond: rateLimits.maxPerSecond,
      maxPerMinute: rateLimits.maxPerMinute,
    });

    // Initialize concurrency limiter
    this.concurrencyLimiter = pLimit(BATCH.CONCURRENCY);

    logger.info("🧶 Thread Monitoring Processor initialized", {
      batchConfig: BATCH,
      retryConfig: RETRY,
      rateLimits,
      environment: CURRENT_ENV,
    });

    this.setupThreadMonitoringScheduler();
  }

  /**
   * Set up the job scheduler for periodic thread monitoring
   */
  private async setupThreadMonitoringScheduler(): Promise<void> {
    try {
      const checkInterval = this.calculateBaseCheckInterval();
      await this.queue.upsertJobScheduler(
        this.SCHEDULER_ID,
        { every: checkInterval },
        {
          name: "check-threads",
          data: {
            type: "CHECK_THREADS",
            batchSize: BATCH.MIN_SIZE,
            priority: THREAD_CONFIG.PRIORITY.RECENT_HIGH_ENGAGEMENT,
          },
          opts: {
            removeOnComplete: true,
            removeOnFail: true,
            priority: THREAD_CONFIG.PRIORITY.RECENT_HIGH_ENGAGEMENT,
          },
        }
      );
      logger.info(
        `🧶 Thread monitoring scheduler initialized with ${checkInterval}ms interval`
      );
    } catch (error) {
      logger.error("🧶 ❌ Failed to setup thread monitoring scheduler:", error);
      throw error;
    }
  }

  protected async process(job: Job<ThreadCheckJob>): Promise<void> {
    try {
      const batchSize = this.calculateDynamicBatchSize(job.data.batchSize);
      await this.processThreadBatch(batchSize, job.data);
    } catch (error) {
      logger.error(
        `🧶 ❌ Failed to process thread monitoring job ${job.id}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Calculate dynamic batch size based on system load and queue metrics
   */
  private calculateDynamicBatchSize(requestedSize?: number): number {
    const baseSize = requestedSize || BATCH.MIN_SIZE;
    // TODO: Implement dynamic sizing based on metrics
    return Math.min(Math.max(baseSize, BATCH.MIN_SIZE), BATCH.MAX_SIZE);
  }

  /**
   * Process a batch of threads that need monitoring
   */
  private async processThreadBatch(
    batchSize: number,
    jobData: ThreadCheckJob
  ): Promise<void> {
    try {
      logger.info("🧶 Starting thread batch processing", {
        batchSize,
        priority: jobData.priority,
        threadAge: jobData.threadAge,
        timestamp: new Date().toISOString(),
      });

      // Find threads that need checking
      const threadsToCheck = await this.findThreadsToCheck(batchSize, jobData);

      logger.info(`🧶 Found ${threadsToCheck.length} threads to check`);

      // Process threads in parallel with rate limiting
      const results = await Promise.allSettled(
        threadsToCheck.map((thread) =>
          this.concurrencyLimiter(async () => {
            await this.rateLimiter.acquire();
            try {
              await this.checkThread(thread);
            } catch (error) {
              if (this.shouldRetryAfterError(error)) {
                await this.scheduleRetry(thread, error);
              } else {
                logger.error(
                  `🧶 ❌ Permanent error checking thread ${thread.threadId}:`,
                  error
                );
              }
            } finally {
              this.rateLimiter.release();
            }
          })
        )
      );

      // Log batch completion metrics
      const successCount = results.filter(
        (r) => r.status === "fulfilled"
      ).length;
      const failureCount = results.filter(
        (r) => r.status === "rejected"
      ).length;

      logger.info("🧶 ✅ Completed thread monitoring batch", {
        total: threadsToCheck.length,
        success: successCount,
        failures: failureCount,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(error, "🧶 ❌ Error in processThreadBatch:");
      throw error;
    }
  }

  /**
   * Find threads that need checking based on their status and age
   */
  private async findThreadsToCheck(
    batchSize: number,
    jobData: ThreadCheckJob
  ): Promise<any[]> {
    const now = new Date();

    // Calculate age thresholds
    const ageThresholds = {
      recent: this.calculateTimeThreshold(AGE_THRESHOLDS[CURRENT_ENV].RECENT),
      medium: this.calculateTimeThreshold(AGE_THRESHOLDS[CURRENT_ENV].MEDIUM),
      old: this.calculateTimeThreshold(AGE_THRESHOLDS[CURRENT_ENV].OLD),
    };

    // Calculate check frequencies
    const checkFrequencies = {
      recent: this.calculateTimeThreshold(
        CHECK_FREQUENCIES[CURRENT_ENV].RECENT
      ),
      medium: this.calculateTimeThreshold(
        CHECK_FREQUENCIES[CURRENT_ENV].MEDIUM
      ),
      old: this.calculateTimeThreshold(CHECK_FREQUENCIES[CURRENT_ENV].OLD),
      veryOld: this.calculateTimeThreshold(
        CHECK_FREQUENCIES[CURRENT_ENV].VERY_OLD
      ),
    };

    // TODO : check if proper index is created for lastCheckedAt
    // Build the where clause based on thread age and status
    const where: Prisma.EmailThreadWhereInput = {
      // Skip fake threads
      isFake: false,
      // Check threads based on their last check time and age
      OR: [
        // New threads that haven't been checked
        {
          lastCheckedAt: null,
        },
        // Recent threads with recent updates
        {
          AND: [
            { createdAt: { gte: ageThresholds.recent } },
            {
              updatedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
            },
            {
              OR: [
                { lastCheckedAt: null },
                { lastCheckedAt: { lt: checkFrequencies.recent } },
              ],
            },
          ],
        },
        // Recent threads without recent updates
        {
          AND: [
            { createdAt: { gte: ageThresholds.recent } },
            {
              updatedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
            },
            {
              OR: [
                { lastCheckedAt: null },
                { lastCheckedAt: { lt: checkFrequencies.medium } },
              ],
            },
          ],
        },
        // Medium-age threads
        {
          AND: [
            {
              createdAt: {
                gte: ageThresholds.medium,
                lt: ageThresholds.recent,
              },
            },
            {
              OR: [
                { lastCheckedAt: null },
                { lastCheckedAt: { lt: checkFrequencies.medium } },
              ],
            },
          ],
        },
        // Old threads
        {
          AND: [
            { createdAt: { gte: ageThresholds.old, lt: ageThresholds.medium } },
            {
              OR: [
                { lastCheckedAt: null },
                { lastCheckedAt: { lt: checkFrequencies.old } },
              ],
            },
          ],
        },
        // Very old threads
        {
          AND: [
            { createdAt: { lt: ageThresholds.old } },
            {
              OR: [
                { lastCheckedAt: null },
                { lastCheckedAt: { lt: checkFrequencies.veryOld } },
              ],
            },
          ],
        },
      ],

      // TODO : remove this because userId and sequenceId are not used afaik
      // Filter by user or sequence if specified
      ...(jobData.userId && { sequence: { userId: jobData.userId } }),
      ...(jobData.sequenceId && { sequenceId: jobData.sequenceId }),

      // TODO : @findThreadsToCheck() we do not have path status so we need to remove it and add a new column
      // Check metadata for completion status
      // metadata: {
      //   path: ["status"],
      //   not: {
      //     in: ["COMPLETED", "BOUNCED", "REPLIED", "UNSUBSCRIBED"],
      //   },
      // },
    };

    // Add age-specific filtering if specified in the job
    if (jobData.threadAge) {
      const ageFilter = this.getAgeSpecificFilter(
        jobData.threadAge,
        ageThresholds
      );
      if (ageFilter && where.OR) {
        where.AND = [...(Array.isArray(where.AND) ? where.AND : []), ageFilter];
      }
    }

    return prisma.emailThread.findMany({
      where,
      take: batchSize,
      orderBy: [
        { updatedAt: "desc" },
        { lastCheckedAt: "asc" },
        { createdAt: "asc" },
      ],
      include: {
        sequence: {
          select: {
            userId: true,
          },
        },
      },
    });
  }

  /**
   * Calculate time threshold based on configuration
   */
  private calculateTimeThreshold(config: {
    minutes?: number;
    hours?: number;
    days?: number;
  }): Date {
    const now = new Date();
    const msToSubtract =
      (config.days || 0) * 24 * 60 * 60 * 1000 +
      (config.hours || 0) * 60 * 60 * 1000 +
      (config.minutes || 0) * 60 * 1000;

    return new Date(now.getTime() - msToSubtract);
  }

  /**
   * Get age-specific filter for thread queries
   */
  private getAgeSpecificFilter(
    age: "RECENT" | "MEDIUM" | "OLD" | "VERY_OLD",
    thresholds: { recent: Date; medium: Date; old: Date }
  ): Prisma.EmailThreadWhereInput | null {
    switch (age) {
      case "RECENT":
        return { createdAt: { gte: thresholds.recent } };
      case "MEDIUM":
        return {
          AND: [
            { createdAt: { gte: thresholds.medium } },
            { createdAt: { lt: thresholds.recent } },
          ],
        };
      case "OLD":
        return {
          AND: [
            { createdAt: { gte: thresholds.old } },
            { createdAt: { lt: thresholds.medium } },
          ],
        };
      case "VERY_OLD":
        return { createdAt: { lt: thresholds.old } };
      default:
        return null;
    }
  }

  /**
   * Determine if an error should trigger a retry
   */
  private shouldRetryAfterError(error: any): boolean {
    const permanentErrors = [
      "Invalid thread ID",
      "Thread not found",
      "Account not found",
      "Invalid credentials",
      "Account disconnected",
    ];

    if (error.message) {
      return !permanentErrors.some((errMsg) => error.message.includes(errMsg));
    }

    return true;
  }

  /**
   * Schedule a retry for a failed thread check
   */
  private async scheduleRetry(thread: any, error: any): Promise<void> {
    const retryCount = (thread.metadata?.retryCount || 0) + 1;
    if (retryCount <= RETRY.MAX_ATTEMPTS) {
      const delay = Math.min(
        RETRY.BACKOFF.MIN_DELAY *
          Math.pow(RETRY.BACKOFF.FACTOR, retryCount - 1),
        RETRY.BACKOFF.MAX_DELAY
      );

      await this.queue.add(
        "retry-thread-check",
        {
          type: "CHECK_THREADS",
          batchSize: 1,
          threadId: thread.threadId,
          retryCount,
        },
        {
          delay,
          removeOnComplete: true,
          removeOnFail: true,
        }
      );

      logger.info(
        `🧶 Scheduled retry #${retryCount} for thread ${thread.threadId} in ${delay}ms`
      );
    }
  }

  /**
   * Calculate base check interval for the scheduler
   */
  private calculateBaseCheckInterval(): number {
    const frequency = CHECK_FREQUENCIES[CURRENT_ENV].RECENT;

    if ("minutes" in frequency) {
      return frequency.minutes * 60 * 1000;
    } else if ("hours" in frequency) {
      return frequency.hours * 60 * 60 * 1000;
    }
    return 60000; // Default to 1 minute
  }

  /**
   * Calculate the delay until next check based on environment
   */
  private calculateNextCheckDelay(): number {
    const frequency = CHECK_FREQUENCIES[CURRENT_ENV].RECENT;

    if ("minutes" in frequency) {
      return frequency.minutes * 60 * 1000;
    } else if ("hours" in frequency) {
      return frequency.hours * 60 * 60 * 1000;
    }
    return 60000; // Default to 1 minute
  }

  /**
   * Check an individual thread for replies or bounces
   */
  private async checkThread(thread: any): Promise<void> {
    try {
      const threadAge = this.getThreadAge(thread.createdAt);

      const mailboxId = await getSequenceMailboxId(thread.sequenceId);

      // TODO : add proper error handling and status updates
      if (!mailboxId) {
        logger.error(
          `🧶 ❌ No mailbox found for sequence ${thread.sequenceId}`
        );
        // Update thread metadata to prevent reprocessing
        await this.updateThreadMetadata(thread, threadAge, false);
        // Mark the thread as completed to prevent further processing
        await prisma.emailThread.update({
          where: { threadId: thread.threadId },
          data: {
            metadata: {
              ...thread.metadata,
              status: "COMPLETED",
              reason: "NO_MAILBOX_FOUND",
              completedAt: new Date().toISOString(),
            },
          },
        });
        return;
      }

      const checkData: ThreadCheckData = {
        threadId: thread.threadId,
        userId: thread.sequence.userId,
        mailboxId: mailboxId,
        sequenceId: thread.sequenceId,
        contactId: thread.contactId,
        messageId: thread.messageId || "",
        createdAt: thread.createdAt,
      };

      // Check for replies and bounces
      const hasNewEvents =
        await this.checkThreadForRepliesAndBounces(checkData);

      // Update thread metadata
      await this.updateThreadMetadata(thread, threadAge, hasNewEvents);

      logger.info(`🧶 ✅ Checked thread ${thread.threadId}`, {
        hasNewEvents,
        threadAge,
      });
    } catch (error) {
      logger.error(error, `🧶 ❌ Error checking thread ${thread.threadId}:`);
      throw error;
    }
  }

  private async checkThreadForRepliesAndBounces(
    data: ThreadCheckData
  ): Promise<boolean> {
    const gmail = await GmailClientService.getInstance().getClient(
      data.userId!,
      data.mailboxId!
    );

    try {
      logger.info(
        `🧶 Fetching thread ${data.threadId} for user ${data.userId}`
      );

      const thread = await gmail.users.threads.get({
        userId: "me",
        id: data.threadId,
      });

      if (!thread.data.messages) {
        logger.warn(`🧶 No messages found in thread ${data.threadId}`);
        return false;
      }

      logger.info(
        `🧶 Found ${thread.data.messages.length} messages in thread ${data.threadId}`
      );
      let foundNewEvent = false;

      // Process each message in the thread
      for (const message of thread.data.messages) {
        if (!message.id) continue;

        logger.debug(
          `🧶 Checking message ${message.id} in thread ${data.threadId}`
        );

        const messageDetails = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "metadata",
          metadataHeaders: [
            "From",
            "To",
            "Subject",
            "References",
            "In-Reply-To",
            "Content-Type",
            "X-Failed-Recipients",
            "Message-ID",
            "Date",
          ],
        });

        const headers = messageDetails.data.payload?.headers || [];
        const labelIds = messageDetails.data.labelIds || [];

        logger.debug("🧶 Message headers details");

        // Check for bounces
        const isBounce = isBounceMessage(headers);
        logger.debug(`🧶 Bounce check for message ${message.id}: ${isBounce}`);

        if (isBounce) {
          logger.info(`🧶 Found bounce in message ${message.id}`);
          await this.processBounce(data, message.id, headers);
          foundNewEvent = true;
          break;
        }

        // Check for replies
        if (!isBounce && shouldProcessMessage(labelIds)) {
          const fromHeader =
            headers.find(
              (h: MessagePartHeader) => h.name?.toLowerCase() === "from"
            )?.value || "";
          const senderEmail = extractEmailFromHeader(fromHeader);

          logger.debug(
            {
              messageId: message.id,
              fromHeader,
              senderEmail,
              isOwner: isSenderSequenceOwner(senderEmail, data.userId),
            },
            "🧶 Sender check"
          );

          if (!isSenderSequenceOwner(senderEmail, data.userId)) {
            logger.info(
              `🧶 Found reply in message ${message.id} from ${senderEmail}`
            );
            await this.processReply(
              data,
              message.id,
              fromHeader,
              messageDetails
            );
            foundNewEvent = true;
            break;
          }
        }
      }

      logger.info(
        `✅ Finished checking thread ${data.threadId}, foundNewEvent: ${foundNewEvent}`
      );
      return foundNewEvent;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : "Unknown error",
          threadId: data.threadId,
          userId: data.userId,
        },
        "❌ Error checking thread"
      );
      throw error;
    }
  }

  private async processBounce(
    data: ThreadCheckData,
    messageId: string,
    headers: MessagePartHeader[]
  ) {
    const existingBounce = await prisma.emailEvent.findFirst({
      where: {
        sequenceId: data.sequenceId,
        contactId: data.contactId,
        type: EmailEventEnum.BOUNCED,
      },
    });

    if (!existingBounce) {
      // first find the tracking id of the reply
      const trackingId = await prisma.emailEvent.findFirst({
        where: {
          sequenceId: data.sequenceId,
          contactId: data.contactId,
          type: EmailEventEnum.SENT,
        },
      });

      if (!trackingId) {
        console.error("No tracking ID found for the bounce event");
        return;
      }

      await prisma.emailEvent.create({
        data: {
          type: EmailEventEnum.BOUNCED,
          sequenceId: data.sequenceId,
          contactId: data.contactId,
          trackingId: trackingId?.trackingId,
          metadata: {
            messageId,
            threadId: data.threadId,
            bounceReason: headers.find((h) => h.name === "X-Failed-Recipients")
              ?.value,
          },
        },
      });

      await prisma.sequenceContact.updateMany({
        where: {
          sequenceId: data.sequenceId,
          contactId: data.contactId,
          status: {
            notIn: [
              SequenceContactStatusEnum.COMPLETED,
              SequenceContactStatusEnum.BOUNCED,
              SequenceContactStatusEnum.OPTED_OUT,
            ],
          },
        },
        data: {
          status: SequenceContactStatusEnum.BOUNCED,
          updatedAt: new Date(),
        },
      });

      await updateSequenceStats(
        data.sequenceId,
        EmailEventEnum.BOUNCED,
        data.contactId
      );
    }
  }

  private async processReply(
    data: ThreadCheckData,
    messageId: string,
    fromHeader: string,
    messageDetails: any
  ) {
    const existingReply = await prisma.emailEvent.findFirst({
      where: {
        sequenceId: data.sequenceId,
        contactId: data.contactId,
        type: EmailEventEnum.REPLIED,
      },
    });

    if (!existingReply) {
      // first find the tracking id of the reply
      const trackingId = await prisma.emailEvent.findFirst({
        where: {
          sequenceId: data.sequenceId,
          contactId: data.contactId,
          type: EmailEventEnum.SENT,
        },
      });

      if (!trackingId) {
        console.error("No tracking ID found for the reply event");
        return;
      }

      await prisma.emailEvent.create({
        data: {
          type: EmailEventEnum.REPLIED,
          sequenceId: data.sequenceId,
          contactId: data.contactId,
          trackingId: trackingId?.trackingId,
          metadata: {
            messageId,
            threadId: data.threadId,
            from: fromHeader,
            snippet: messageDetails.data.snippet,
            timestamp: new Date().toISOString(),
          },
        },
      });

      await updateSequenceStats(
        data.sequenceId,
        EmailEventEnum.REPLIED,
        data.contactId
      );
    }
  }

  private getEnvironmentConfig(): Environment {
    return CURRENT_ENV;
  }

  private calculateTimeInMilliseconds(time: {
    seconds?: number;
    minutes?: number;
    hours?: number;
    days?: number;
  }): number {
    const seconds = time.seconds || 0;
    const minutes = time.minutes || 0;
    const hours = time.hours || 0;
    const days = time.days || 0;

    return (
      seconds * 1000 +
      minutes * 60 * 1000 +
      hours * 60 * 60 * 1000 +
      days * 24 * 60 * 60 * 1000
    );
  }

  private getThreadAge(createdAt: Date): number {
    const now = DateTime.now();
    const created = DateTime.fromJSDate(createdAt);

    // For development, use minutes instead of days
    if (CURRENT_ENV === "DEVELOPMENT") {
      return now.diff(created, "minutes").minutes;
    }

    return now.diff(created, "days").days;
  }

  /**
   * Update thread metadata after checking
   */
  private async updateThreadMetadata(
    thread: any,
    threadAge: number,
    hasNewEvents: boolean
  ): Promise<void> {
    const nextCheckDelay = this.calculateNextCheckDelay();
    const nextCheckAt = new Date(Date.now() + nextCheckDelay);

    await prisma.emailThread.update({
      where: { threadId: thread.threadId },
      data: {
        lastCheckedAt: new Date(),
        metadata: {
          lastCheckedAt: new Date().toISOString(),
          nextCheckAt: hasNewEvents ? null : nextCheckAt.toISOString(),
          environment: CURRENT_ENV,
          threadAge,
          checkFrequency: {
            env: CURRENT_ENV,
            threadAge,
            nextCheckDelay,
          },
        },
      },
    });
  }
}
