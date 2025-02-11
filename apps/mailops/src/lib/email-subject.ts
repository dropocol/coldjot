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
  try {
    // Determine if this is the first email by checking existing emails in thread
    let isFirstEmail = true;
    if (threadId) {
      const existingEmails = await prisma.emailTracking.count({
        where: { threadId },
      });
      isFirstEmail = existingEmails === 0;
    }

    // Case 1: First email in sequence or non-reply step
    if (isFirstEmail || !step.replyToThread) {
      const processedSubject = contact
        ? replacePlaceholders(step.subject || "No Subject", {
            contact,
            fallbacks: {},
          })
        : step.subject || "No Subject";
      return {
        subject: processedSubject,
        isReply: false,
        originalSubject: processedSubject,
      };
    }

    // Case 2: Reply to Thread - First try to get subject from local database
    if (threadId && step.replyToThread) {
      try {
        // First try to get from emailThreads
        const emailThread = await prisma.emailThread.findUnique({
          where: { threadId },
          select: { subject: true },
        });

        if (emailThread?.subject) {
          const subject = emailThread.subject.startsWith("Re:")
            ? emailThread.subject
            : `Re: ${emailThread.subject}`;

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

        if (emailTracking?.subject) {
          const subject = emailTracking.subject.startsWith("Re:")
            ? emailTracking.subject
            : `Re: ${emailTracking.subject}`;

          return {
            subject,
            isReply: true,
            originalSubject: emailTracking.subject,
          };
        }

        // If no local data, fallback to Gmail API
        if (!gmail) {
          throw new Error("Gmail client required for reply threads");
        }

        const threadSubject = await getGmailSubject(gmail, threadId);
        if (!threadSubject) {
          logger.warn("No subject found in thread, using step subject");
          return {
            subject: step.subject || "No Subject",
            isReply: false,
          };
        }

        return {
          subject: threadSubject.startsWith("Re:")
            ? threadSubject
            : `Re: ${threadSubject}`,
          isReply: true,
          originalSubject: threadSubject,
        };
      } catch (error) {
        logger.warn("Failed to fetch thread subject, using step subject", {
          error,
        });
        return {
          subject: step.subject || "No Subject",
          isReply: false,
        };
      }
    }

    // Case 3: Default to step subject for any other case
    return {
      subject: step.subject || "No Subject",
      isReply: false,
    };
  } catch (error) {
    logger.error("Error determining email subject:", error);
    // Fallback to step subject in case of any error
    return {
      subject: step.subject || "No Subject",
      isReply: false,
    };
  }
}
