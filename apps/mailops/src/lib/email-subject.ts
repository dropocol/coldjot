import { gmail_v1 } from "googleapis";
import { getGmailSubject } from "./google/gmail";
import type { SequenceStep, SubjectInfo } from "@coldjot/types";
import { logger } from "./log";
import { PrismaEmailThreadRepository } from "@/repositories/prisma/prisma-email-thread.repo";
import { PrismaEmailTrackingRepository } from "@/repositories/prisma/prisma-email-tracking.repo";
import { PrismaTemplateRepository } from "@/repositories/prisma/prisma-template.repo";
import { replacePlaceholders } from "@/lib/placeholders";
import type { Contact } from "@prisma/client";

// Module-level repo singletons — bridges the standalone determineEmailSubject
// fn until Phase 4 turns it into a proper service. Matches the lib/tracking
// stopgap pattern.
const emailThreadRepo = new PrismaEmailThreadRepository();
const emailTrackingRepo = new PrismaEmailTrackingRepository();
const templateRepo = new PrismaTemplateRepository();

export async function determineEmailSubject(
  step: SequenceStep,
  threadId?: string,
  gmail?: gmail_v1.Gmail,
  contact?: Contact
): Promise<SubjectInfo> {
  logger.info({
    stepId: step.id,
    threadId,
    hasGmail: !!gmail,
    hasContact: !!contact,
    stepSubject: step.subject,
    replyToThread: step.replyToThread,
    order: step.order,
    templateId: step.templateId,
  }, "Starting determineEmailSubject");

  // Process subject with placeholders
  const processSubject = (subject: string) => {
    const processed = contact
      ? replacePlaceholders(subject, {
          contact,
          fallbacks: {},
        })
      : subject;
    logger.debug({
      original: subject,
      processed,
      hasContact: !!contact,
    }, "Processed subject with placeholders");
    return processed;
  };

  try {
    // Determine if this is a new thread based on replyToThread flag and existing emails
    let isNewThread = true;
    let existingEmails = 0;

    if (threadId) {
      existingEmails = await emailTrackingRepo.countByThread(threadId);
      // It's a new thread if:
      // 1. replyToThread is false (regardless of order number) OR
      // 2. There are no existing emails in the thread
      isNewThread = !step.replyToThread || existingEmails === 0;

      logger.debug({
        threadId,
        existingEmails,
        isNewThread,
        replyToThread: step.replyToThread,
        order: step.order,
      }, "Checked thread status");
    }

    // Case 1: New Thread - Get subject from template or step
    if (isNewThread) {
      let newThreadSubject: string | null = null;

      // Try to get subject from template if templateId exists
      if (step.templateId) {
        const templateSubject = await templateRepo.findSubject(step.templateId);

        logger.debug({
          templateId: step.templateId,
          templateSubject,
        }, "Fetched template subject");

        if (templateSubject) {
          newThreadSubject = templateSubject;
        }
      }

      // Fallback to step subject if no template subject
      const baseSubject = newThreadSubject || step.subject || "No Subject";
      const processedSubject = processSubject(baseSubject);

      logger.info({
        templateId: step.templateId,
        hasTemplateSubject: !!newThreadSubject,
        baseSubject,
        processedSubject,
      }, "Using new thread subject");

      return {
        subject: processedSubject,
        isReply: false,
        originalSubject: processedSubject,
      };
    }

    // Case 2: Reply to Thread - Try to get original subject from various sources
    if (threadId) {
      logger.debug({ threadId }, "Handling reply to thread");
      try {
        // First try to get from emailThreads
        const emailThreadSubject =
          await emailThreadRepo.findSubjectByThread(threadId);

        logger.debug({
          threadId,
          foundSubject: emailThreadSubject,
        }, "Fetched subject from emailThread");

        if (emailThreadSubject) {
          // For replies, always use the original thread subject
          const processedSubject = processSubject(emailThreadSubject);
          const subject = processedSubject.startsWith("Re:")
            ? processedSubject
            : `Re: ${processedSubject}`;

          logger.info({
            originalSubject: emailThreadSubject,
            processedSubject,
            finalSubject: subject,
          }, "Using emailThread subject for reply");

          return {
            subject,
            isReply: true,
            originalSubject: emailThreadSubject,
          };
        }

        // If not in emailThreads, try emailTracking
        const trackingSubject =
          await emailTrackingRepo.findEarliestSubjectInThread(threadId);

        logger.debug({
          threadId,
          foundSubject: trackingSubject,
        }, "Fetched subject from emailTracking");

        if (trackingSubject) {
          // For replies, always use the original thread subject
          const processedSubject = processSubject(trackingSubject);
          const subject = processedSubject.startsWith("Re:")
            ? processedSubject
            : `Re: ${processedSubject}`;

          logger.info({
            originalSubject: trackingSubject,
            processedSubject,
            finalSubject: subject,
          }, "Using emailTracking subject for reply");

          return {
            subject,
            isReply: true,
            originalSubject: trackingSubject,
          };
        }

        // If no local data, fallback to Gmail API
        if (!gmail) {
          logger.warn(
            "Gmail client required for reply threads but not provided"
          );
          throw new Error("Gmail client required for reply threads");
        }

        const threadSubject = await getGmailSubject(gmail, threadId);
        logger.debug({
          threadId,
          foundSubject: threadSubject,
        }, "Fetched subject from Gmail API");

        if (!threadSubject) {
          logger.warn(
            "No subject found in Gmail thread, falling back to template/step subject"
          );
          // Try template subject first, then fall back to step subject
          let fallbackSubject: string | null = null;

          if (step.templateId) {
            fallbackSubject = await templateRepo.findSubject(step.templateId);
          }

          const baseSubject = fallbackSubject || step.subject || "No Subject";
          return {
            subject: processSubject(baseSubject),
            isReply: false,
          };
        }

        // For replies, always use the original thread subject
        const processedSubject = processSubject(threadSubject);
        const subject = processedSubject.startsWith("Re:")
          ? processedSubject
          : `Re: ${processedSubject}`;

        logger.info({
          originalSubject: threadSubject,
          processedSubject,
          finalSubject: subject,
        }, "Using Gmail API subject for reply");

        return {
          subject,
          isReply: true,
          originalSubject: threadSubject,
        };
      } catch (error) {
        logger.warn({
            error,
            templateId: step.templateId,
            stepSubject: step.subject,
          }, "Failed to fetch thread subject, falling back to template/step subject");

        // Try template subject first, then fall back to step subject
        let fallbackSubject: string | null = null;

        if (step.templateId) {
          fallbackSubject = await templateRepo.findSubject(step.templateId);
        }

        const baseSubject = fallbackSubject || step.subject || "No Subject";
        return {
          subject: processSubject(baseSubject),
          isReply: false,
        };
      }
    }

    // Case 3: Default fallback - Try template subject first, then step subject
    logger.info("Using default fallback subject resolution");
    let fallbackSubject: string | null = null;

    if (step.templateId) {
      fallbackSubject = await templateRepo.findSubject(step.templateId);
    }

    const baseSubject = fallbackSubject || step.subject || "No Subject";
    const processedSubject = processSubject(baseSubject);

    logger.info({
      templateId: step.templateId,
      hasTemplateSubject: !!fallbackSubject,
      stepSubject: step.subject,
      finalSubject: processedSubject,
    }, "Using fallback subject");

    return {
      subject: processedSubject,
      isReply: false,
    };
  } catch (error) {
    logger.error({
      error,
      templateId: step.templateId,
      stepSubject: step.subject,
    }, "Error determining email subject");

    // Final fallback - Try template subject first, then step subject
    try {
      let fallbackSubject: string | null = null;

      if (step.templateId) {
        fallbackSubject = await templateRepo.findSubject(step.templateId);
      }

      const baseSubject = fallbackSubject || step.subject || "No Subject";
      return {
        subject: processSubject(baseSubject),
        isReply: false,
      };
    } catch (innerError) {
      logger.error({ ctx: innerError }, "Failed even in final fallback");
      return {
        subject: "No Subject",
        isReply: false,
      };
    }
  }
}
