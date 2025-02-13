import { gmail_v1 } from "googleapis";
import { getGmailSubject } from "./google/gmail";
import type { SequenceStep } from "@coldjot/types";
import { logger } from "./log";
import { prisma } from "@coldjot/database";
import { replacePlaceholders } from "@/lib/placeholders";
import type { Contact } from "@prisma/client";

export interface SubjectInfo {
  subject: string;
  isReply: boolean;
  originalSubject?: string;
}

export async function determineEmailSubject(
  step: SequenceStep,
  threadId?: string,
  gmail?: gmail_v1.Gmail,
  contact?: Contact
): Promise<SubjectInfo> {
  logger.info("Starting determineEmailSubject", {
    stepId: step.id,
    threadId,
    hasGmail: !!gmail,
    hasContact: !!contact,
    stepSubject: step.subject,
    replyToThread: step.replyToThread,
    order: step.order,
    templateId: step.templateId,
  });

  // Process subject with placeholders
  const processSubject = (subject: string) => {
    const processed = contact
      ? replacePlaceholders(subject, {
          contact,
          fallbacks: {},
        })
      : subject;
    logger.debug("Processed subject with placeholders", {
      original: subject,
      processed,
      hasContact: !!contact,
    });
    return processed;
  };

  try {
    // Determine if this is a new thread based on replyToThread flag and existing emails
    let isNewThread = true;
    let existingEmails = 0;

    if (threadId) {
      existingEmails = await prisma.emailTracking.count({
        where: { threadId },
      });
      // It's a new thread if:
      // 1. replyToThread is false (regardless of order number) OR
      // 2. There are no existing emails in the thread
      isNewThread = !step.replyToThread || existingEmails === 0;

      logger.debug("Checked thread status", {
        threadId,
        existingEmails,
        isNewThread,
        replyToThread: step.replyToThread,
        order: step.order,
      });
    }

    // Case 1: New Thread - Get subject from template or step
    if (isNewThread) {
      let newThreadSubject: string | null = null;

      // Try to get subject from template if templateId exists
      if (step.templateId) {
        const template = await prisma.template.findUnique({
          where: { id: step.templateId },
          select: { subject: true },
        });

        logger.debug("Fetched template subject", {
          templateId: step.templateId,
          templateSubject: template?.subject,
        });

        if (template?.subject) {
          newThreadSubject = template.subject;
        }
      }

      // Fallback to step subject if no template subject
      const baseSubject = newThreadSubject || step.subject || "No Subject";
      const processedSubject = processSubject(baseSubject);

      logger.info("Using new thread subject", {
        templateId: step.templateId,
        hasTemplateSubject: !!newThreadSubject,
        baseSubject,
        processedSubject,
      });

      return {
        subject: processedSubject,
        isReply: false,
        originalSubject: processedSubject,
      };
    }

    // Case 2: Reply to Thread - Try to get original subject from various sources
    if (threadId) {
      logger.debug("Handling reply to thread", { threadId });
      try {
        // First try to get from emailThreads
        const emailThread = await prisma.emailThread.findUnique({
          where: { threadId },
          select: { subject: true },
        });

        logger.debug("Fetched subject from emailThread", {
          threadId,
          foundSubject: emailThread?.subject,
        });

        if (emailThread?.subject) {
          // For replies, always use the original thread subject
          const processedSubject = processSubject(emailThread.subject);
          const subject = processedSubject.startsWith("Re:")
            ? processedSubject
            : `Re: ${processedSubject}`;

          logger.info("Using emailThread subject for reply", {
            originalSubject: emailThread.subject,
            processedSubject,
            finalSubject: subject,
          });

          return {
            subject,
            isReply: true,
            originalSubject: emailThread.subject,
          };
        }

        // If not in emailThreads, try emailTracking
        const emailTracking = await prisma.emailTracking.findFirst({
          where: {
            threadId: threadId,
            subject: { not: "" },
          },
          orderBy: { createdAt: "asc" },
          select: { subject: true },
        });

        logger.debug("Fetched subject from emailTracking", {
          threadId,
          foundSubject: emailTracking?.subject,
        });

        if (emailTracking?.subject) {
          // For replies, always use the original thread subject
          const processedSubject = processSubject(emailTracking.subject);
          const subject = processedSubject.startsWith("Re:")
            ? processedSubject
            : `Re: ${processedSubject}`;

          logger.info("Using emailTracking subject for reply", {
            originalSubject: emailTracking.subject,
            processedSubject,
            finalSubject: subject,
          });

          return {
            subject,
            isReply: true,
            originalSubject: emailTracking.subject,
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
        logger.debug("Fetched subject from Gmail API", {
          threadId,
          foundSubject: threadSubject,
        });

        if (!threadSubject) {
          logger.warn(
            "No subject found in Gmail thread, falling back to template/step subject"
          );
          // Try template subject first, then fall back to step subject
          let fallbackSubject: string | null = null;

          if (step.templateId) {
            const template = await prisma.template.findUnique({
              where: { id: step.templateId },
              select: { subject: true },
            });
            fallbackSubject = template?.subject || null;
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

        logger.info("Using Gmail API subject for reply", {
          originalSubject: threadSubject,
          processedSubject,
          finalSubject: subject,
        });

        return {
          subject,
          isReply: true,
          originalSubject: threadSubject,
        };
      } catch (error) {
        logger.warn(
          "Failed to fetch thread subject, falling back to template/step subject",
          {
            error,
            templateId: step.templateId,
            stepSubject: step.subject,
          }
        );

        // Try template subject first, then fall back to step subject
        let fallbackSubject: string | null = null;

        if (step.templateId) {
          const template = await prisma.template.findUnique({
            where: { id: step.templateId },
            select: { subject: true },
          });
          fallbackSubject = template?.subject || null;
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
      const template = await prisma.template.findUnique({
        where: { id: step.templateId },
        select: { subject: true },
      });
      fallbackSubject = template?.subject || null;
    }

    const baseSubject = fallbackSubject || step.subject || "No Subject";
    const processedSubject = processSubject(baseSubject);

    logger.info("Using fallback subject", {
      templateId: step.templateId,
      hasTemplateSubject: !!fallbackSubject,
      stepSubject: step.subject,
      finalSubject: processedSubject,
    });

    return {
      subject: processedSubject,
      isReply: false,
    };
  } catch (error) {
    logger.error("Error determining email subject:", {
      error,
      templateId: step.templateId,
      stepSubject: step.subject,
    });

    // Final fallback - Try template subject first, then step subject
    try {
      let fallbackSubject: string | null = null;

      if (step.templateId) {
        const template = await prisma.template.findUnique({
          where: { id: step.templateId },
          select: { subject: true },
        });
        fallbackSubject = template?.subject || null;
      }

      const baseSubject = fallbackSubject || step.subject || "No Subject";
      return {
        subject: processSubject(baseSubject),
        isReply: false,
      };
    } catch (innerError) {
      logger.error("Failed even in final fallback:", innerError);
      return {
        subject: "No Subject",
        isReply: false,
      };
    }
  }
}
