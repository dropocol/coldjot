/**
 * Domain service interface — one scheduler tick: find due contacts and enqueue
 * email jobs.
 */
import {
  StepStatus,
  type StepType,
  StepTiming,
  type EmailJob,
  type SequenceStep,
  type DueContactGraph,
  SequenceContactStatusEnum,
} from "@coldjot/types";
import type { Db } from "@coldjot/database";
import { logger } from "@/lib/log";
import { rateLimitService as defaultRateLimitService } from "@/services/core/rate-limit/service";
import { scheduleGenerator as defaultScheduleGenerator } from "@/lib/schedule";
import {
  SCHEDULE_MAX_FAILURES,
  SCHEDULE_FAILURE_BACKOFF_MS,
} from "@/config/queue/policy";
import { updateSequenceContactStatus } from "@/services/jobs/sequence/helper";

import type { JobManager } from "@/services/jobs/job-manager";
import type { RateLimitService } from "@/services/core/rate-limit/service";
import type { ScheduleGenerator } from "@/lib/schedule";

// ---- Interface -----------------------------------------------------------

export interface RunScheduleService {
  tick(): Promise<{ enqueued: number }>;
}

// ---- Implementation ------------------------------------------------------

/**
 * Live `RunScheduleServiceImpl` — the canonical scheduler tick.
 *
 * Extracted from `services/jobs/schedule/processor.ts`'s
 * `processScheduledEmails` + `processEmail` in Phase 7.2b. The processor is
 * now a thin BullMQ wrapper that calls `service.tick()`; all the domain logic
 * (find due → rate-limit check → resolve step → compute send time → build
 * EmailJob → enqueue → advance progress → bounded-retry on failure) lives here.
 *
 * Behavior is identical to the pre-refactor processor:
 *   - find due SequenceContacts (nextScheduledAt <= now)
 *   - per contact: rate-limit gate → resolve current step (deleted-step no-op)
 *     → calculateNextRun → build EmailJob (with reply-to-thread threadId) →
 *     jobManager.addEmailJob → mark SCHEDULED → increment counters
 *   - per-contact try/catch: on failure, bump failureCount; at
 *     SCHEDULE_MAX_FAILURES mark FAILED + clear nextScheduledAt, else schedule
 *     a SCHEDULE_FAILURE_BACKOFF_MS retry. Re-throw so the poller job surfaces
 *     as failed in BullMQ (the repeating scheduler keeps firing regardless).
 *
 * `rateLimitService` + `scheduleGenerator` default to their module exports so
 * the Group D characterization test's module-level mocks (`vi.mock`) apply when
 * the service is constructed with no overrides — same trick the email/schedule
 * processors relied on before. The composition root passes the real instances.
 */
export class RunScheduleServiceImpl implements RunScheduleService {
  constructor(
    private readonly db: Db,
    private readonly jobManager: JobManager,
    private readonly rateLimitService: Pick<
      RateLimitService,
      "checkRateLimit" | "incrementCounters"
    > = defaultRateLimitService,
    private readonly scheduleGen: Pick<ScheduleGenerator, "calculateNextRun"> = defaultScheduleGenerator
  ) {}

  async tick(): Promise<{ enqueued: number }> {
    let enqueued = 0;

    logger.info(
      { timestamp: new Date().toISOString() },
      "🔍 Checking for scheduled emails to process"
    );

    const dueEmails = await this.db.sequenceContact.findDueContacts(new Date());

    // Development mode: log scheduled times for debugging.
    const isDevelopment = process.env.APP_ENV === "development";
    if (isDevelopment) {
      logger.debug(
        {
          currentTime: new Date().toISOString(),
          scheduledEmails: dueEmails.map((email) => ({
            id: email.id,
            nextScheduledAt: email.nextScheduledAt?.toISOString(),
            email: email.contact.email,
            stepIndex: email.currentStep,
          })),
        },
        "🔧 Development mode: Scheduled emails"
      );
    }

    logger.info(`📥 Found ${dueEmails.length} emails to process`);

    for (const email of dueEmails) {
      try {
        const did = await this.processEmail(email);
        if (did) enqueued++;
      } catch (error) {
        logger.error(
          {
            id: email.id,
            sequenceId: email.sequenceId,
            contactId: email.contactId,
            email: email.contact.email,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
          },
          "❌ Error processing email"
        );
        // Continue with next email even if one fails.
      }
    }

    logger.info(
      {
        processedCount: dueEmails.length,
        timestamp: new Date().toISOString(),
      },
      "✅ Completed processing batch of scheduled emails"
    );

    return { enqueued };
  }

  /**
   * Process a single due contact. Returns true when an email job was enqueued,
   * false for an early no-op (rate-limit skip, deleted step). Throws on failure
   * (caught by the caller's bounded-retry path).
   */
  private async processEmail(email: DueContactGraph): Promise<boolean> {
    const { sequence, contact } = email;

    logger.info(
      {
        id: email.id,
        sequenceId: sequence.id,
        contactId: contact.id,
        email: contact.email,
        currentStep: email.currentStep,
        totalSteps: sequence.steps.length,
      },
      "📧 Processing email"
    );

    try {
      // 1. Check rate limits
      logger.debug(
        `🔍 Checking rate limits for email user: ${sequence.userId} | sequence: ${sequence.id} | contact: ${contact.id}`
      );

      const { allowed } = await this.rateLimitService.checkRateLimit(
        sequence.userId,
        sequence.id,
        contact.id
      );

      if (!allowed) {
        logger.warn(
          {
            userId: sequence.userId,
            sequenceId: sequence.id,
            contactId: contact.id,
          },
          "⚠️ Rate limit exceeded"
        );
        return false;
      }

      // 2. Get current step. The repo flattens sequenceMailbox →
      // sequenceMailboxId and attaches the BusinessScheduleEnum type to
      // businessHours; we still coerce stepType/timing here.
      const currentStepIndex = email.currentStep - 1;
      const rawStep = sequence.steps[currentStepIndex];
      if (!rawStep) {
        return await this.handleMissingStep(email);
      }
      const currentStep = {
        ...rawStep,
        status: StepStatus.ACTIVE,
        stepType: rawStep.stepType as StepType,
        timing: rawStep.timing as StepTiming,
      } as unknown as SequenceStep;

      logger.debug(
        {
          stepId: currentStep.id,
          stepType: currentStep.stepType,
          timing: currentStep.timing,
          order: currentStep.order,
        },
        "📋 Current step details"
      );

      // 3. Resolve the send time. `nextScheduledAt` is already computed at the
      // point this contact was made due — either by Send Now (= now; manual
      // override that must send immediately, no jitter) or by the previous
      // step's handleSuccessfulEmail (delay + business-hours already applied).
      // Recomputing it here would re-apply the step's delay distribution a
      // second time (e.g. a 5-min-delay step landing 10 min late), and would
      // also add the immediate-timing jitter to a Send Now override.
      // `findDueContacts` already filters `nextScheduledAt IS NOT NULL`, so the
      // `?? calculateNextRun(...)` fallback only guards against unexpected null.
      const nextSendTime = email.nextScheduledAt
        ? new Date(email.nextScheduledAt)
        : await this.scheduleGen.calculateNextRun(
            new Date(),
            currentStep,
            sequence.businessHours
          );

      if (!nextSendTime) {
        logger.error(
          {
            stepId: currentStep.id,
            timing: currentStep.timing,
            businessHours: sequence.businessHours,
          },
          "❌ Could not calculate next send time"
        );
        throw new Error("Could not calculate next send time");
      }

      // Log compact identifiers only — businessHours/currentStep may be
      // verbose and currentStep carries subject/content (PII).
      logger.info(
        { hasBusinessHours: !!sequence.businessHours, stepOrder: currentStep.order, nextSendTime },
        "🕒 Schedule decision"
      );

      logger.debug(
        {
          nextSendTime: nextSendTime.toISOString(),
          delay: nextSendTime.getTime() - Date.now(),
        },
        "⏰ Next send time calculated"
      );

      // Get threadId from SequenceContact if it exists.
      const sequenceContactThreadId = await this.db.sequenceContact.findThreadId(
        sequence.id,
        contact.id
      );
      const sequenceContact = sequenceContactThreadId
        ? { threadId: sequenceContactThreadId }
        : null;

      logger.info(
        {
          sequenceId: sequence.id,
          contactId: contact.id,
          currentStep: email.currentStep,
          stepId: currentStep.id,
          replyToThread: currentStep.replyToThread,
          existingThreadId: sequenceContact?.threadId,
          willUseThreadId: currentStep.replyToThread
            ? sequenceContact?.threadId
            : undefined,
          stepOrder: currentStep.order,
        },
        "🧵 Thread details for email creation"
      );

      if (currentStep.replyToThread && !sequenceContact?.threadId) {
        logger.warn(
          {
            stepId: currentStep.id,
            sequenceId: sequence.id,
            contactId: contact.id,
          },
          "⚠️ Reply to thread was requested but no thread ID found"
        );
      }

      // 4. Create + enqueue the email job.
      const emailJob: EmailJob = {
        sequenceId: sequence.id,
        contactId: contact.id,
        stepId: currentStep.id,
        userId: sequence.userId,
        sequenceMailboxId: sequence.sequenceMailboxId,
        to: contact.email,
        threadId:
          currentStep.replyToThread && sequenceContact?.threadId
            ? sequenceContact.threadId
            : undefined,
        scheduledTime: nextSendTime.toISOString(),
        disableSending: sequence.disableSending,
        testMode: sequence.testMode,
      };

      logger.info("📧 Created email job with thread details");

      logger.debug(
        { scheduledTime: emailJob.scheduledTime },
        "📤 Adding email job to queue"
      );

      await this.jobManager.addEmailJob(emailJob);
      logger.info(
        {
          scheduledTime: nextSendTime.toISOString(),
          to: contact.email,
          sequenceId: sequence.id,
          stepId: currentStep.id,
        },
        "📧 Created email job"
      );

      // 5. Update sequence progress.
      await updateSequenceContactStatus(
        sequence.id,
        contact.id,
        SequenceContactStatusEnum.SCHEDULED,
        { lastProcessedAt: new Date() }
      );

      // 6. Increment rate limit counters.
      logger.debug("🔄 Incrementing rate limit counters");
      await this.rateLimitService.incrementCounters(
        sequence.userId,
        sequence.id,
        contact.id
      );

      logger.info(
        {
          id: email.id,
          sequenceId: sequence.id,
          contactId: contact.id,
          email: contact.email,
          nextStep: email.currentStep,
        },
        "✅ Successfully processed email"
      );
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(
        {
          id: email.id,
          sequenceId: sequence.id,
          contactId: contact.id,
          email: contact.email,
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        },
        "❌ Error processing email"
      );

      // Bounded retry for the schedule path. This service sends emails via the
      // EMAIL queue (added above), so BullMQ attempts don't apply here — we
      // track failures on the SequenceContact row itself. Once a contact hits
      // SCHEDULE_MAX_FAILURES it's marked "failed" and removed from the
      // poller's query (nextScheduledAt = null) so it surfaces in the UI
      // instead of looping forever (plan 10).
      const nextFailureCount = (email.failureCount ?? 0) + 1;
      const exhausted = nextFailureCount >= SCHEDULE_MAX_FAILURES;
      // Truncate stored error so a huge stacktrace can't bloat the row.
      const truncatedError = errorMessage.slice(0, 1000);

      if (exhausted) {
        await this.db.sequenceContact.updateById(email.id, {
          failureCount: nextFailureCount,
          lastError: truncatedError,
          status: SequenceContactStatusEnum.FAILED,
          nextScheduledAt: null,
        });
        logger.error(
          {
            sequenceId: sequence.id,
            contactId: contact.id,
            failureCount: nextFailureCount,
          },
          "contact marked failed after max schedule retries"
        );
      } else {
        const nextRetry = new Date(Date.now() + SCHEDULE_FAILURE_BACKOFF_MS);
        logger.debug(
          {
            id: email.id,
            failureCount: nextFailureCount,
            nextRetry: nextRetry.toISOString(),
          },
          "🔄 Scheduling bounded retry"
        );
        await this.db.sequenceContact.updateById(email.id, {
          failureCount: nextFailureCount,
          lastError: truncatedError,
          nextScheduledAt: nextRetry,
        });
      }

      // Re-throw so the poller job itself is visible as failed in BullMQ.
      // The repeating scheduler continues to fire on its interval regardless.
      throw error;
    }
  }

  /**
   * The current step index didn't resolve to a step in the sequence's steps
   * array. Verify whether the step still exists in the DB; if it's gone, this
   * is a no-op (returns false). If it exists, throw "Step not found" (caught
   * by the per-contact handler → retry).
   */
  private async handleMissingStep(email: DueContactGraph): Promise<boolean> {
    const { sequence } = email;

    logger.error(
      {
        sequenceId: sequence.id,
        currentStep: email.currentStep,
        totalSteps: sequence.steps.length,
      },
      `❌ Step not found for sequence: ${sequence.id} | currentStep: ${email.currentStep} with total steps: ${sequence.steps.length}`
    );

    const stepExists = await this.db.sequenceStep.findBySequenceAndOrder(
      sequence.id,
      email.currentStep
    );

    if (!stepExists) {
      logger.info(
        {
          sequenceId: sequence.id,
          currentStep: email.currentStep,
        },
        "🗑️ Step has been deleted, cleaning up"
      );
      return false;
    }

    throw new Error("Step not found");
  }
}
