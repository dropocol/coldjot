import { prisma } from "@mailjot/database";
import { randomUUID } from "crypto";
import { logger } from "../log/logger";
import { addTrackingToEmail } from "@/services/track/tracking-service";
import { updateSequenceStats } from "@/services/stats/sequence-stats-service";
import type { EmailResult, EmailTrackingMetadata } from "@mailjot/types";
import type { gmail_v1 } from "googleapis";
import type { SendEmailOptions } from "@mailjot/types";
import fs from "fs";

import {
  getSenderInfoWithId,
  createEmailMessage,
  createUntrackedMessage,
} from "./helper";

import { getEmailThreadInfo } from "@/services/google/helper";
import { sendGmailSMTP, gmailClientService } from "@/services/google";

interface SentMessageInfo {
  messageId: string;
  subject: string | undefined;
  threadId: string | undefined;
  headers: gmail_v1.Schema$MessagePartHeader[];
}

export class EmailService {
  private readonly logsDir = "email_logs";

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  constructor() {
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  /**
   * Main function to send an email with tracking and create necessary records
   */
  async sendEmail(options: SendEmailOptions): Promise<EmailResult> {
    try {
      const useApi = true;
      if (useApi) {
        logger.info("📧 Starting email send process");

        // Get gmail client
        const gmail = await gmailClientService.getClient(options.userId);

        // Get sender info using accessToken like SMTP version
        const senderInfo = await getSenderInfoWithId(options.userId);

        // Get thread info exactly like SMTP version
        const { threadHeaders, originalSubject } = await getEmailThreadInfo(
          gmail,
          options.threadId
        );

        // Create tracked version for recipient
        const trackedContent = await addTrackingToEmail(
          options.html,
          options.tracking
        );

        // Create message with proper thread headers - exactly like SMTP version
        const encodedMessage = createEmailMessage({
          fromHeader: senderInfo.header,
          to: options.to,
          subject: options.subject,
          content: trackedContent,
          threadId: options.threadId,
          originalSubject: originalSubject || options.subject,
          threadHeaders,
        });

        const response = await gmail.users.messages.send({
          userId: "me",
          requestBody: {
            raw: encodedMessage,
            threadId: options.threadId || undefined,
          },
        });

        // Wait for Gmail to process the message and get the actual Message-ID
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Get the sent message details
        const sentMessageDetails = await this.getSentMessageDetails(
          gmail,
          response.data.id!
        );

        // Update threadHeaders with the actual Gmail-generated Message-ID
        if (sentMessageDetails.messageId) {
          threadHeaders.messageId = sentMessageDetails.messageId;
        }

        // Create untracked version for sender's sent folder
        if (options.html && response.data.id) {
          const encodedUntrackedMessage = await createUntrackedMessage({
            gmail,
            messageId: response.data.id,
            to: options.to,
            subject: sentMessageDetails.subject || options.subject,
            originalContent: options.html,
            threadId: sentMessageDetails.threadId,
            originalSubject: originalSubject || options.subject,
            threadHeaders,
          });

          // Insert untracked version in sender's sent folder
          await gmail.users.messages.insert({
            userId: "me",
            requestBody: {
              raw: encodedUntrackedMessage,
              threadId: sentMessageDetails.threadId,
              labelIds: ["SENT"],
            },
          });

          // Delete the original tracked message from sent folder
          try {
            await gmail.users.messages.delete({
              userId: "me",
              id: response.data.id,
            });
            logger.info("✅ Original tracked message deleted from sent folder");
          } catch (err) {
            logger.error("Error deleting original tracked message:", err);
          }
        }

        // Create tracking records
        // TODO : The emailId should be the messageId or something else
        // TODO : Update createEmailTrackingRecord with trackingId, sequenceId, contactId, stepId etc
        const emailId = randomUUID();

        await this.updateEmailTracking(
          options.tracking.id,
          options,
          response.data
        );
        // await this.createEmailTrackingRecord(emailId, options, response.data);
        await this.createEmailEvent(
          options.tracking.id,
          options,
          response.data
        );

        logger.info(
          `✨ Email sending process completed successfully ${response.data.id} --- ${response.data.threadId}`
        );

        return {
          success: true,
          messageId: response.data.id!,
          threadId: response.data.threadId!,
        };
      } else {
        // Fallback to SMTP version
        const trackedContent = await addTrackingToEmail(
          options.html,
          options.tracking
        );
        const email = await sendGmailSMTP({
          to: options.to,
          subject: options.subject,
          content: trackedContent,
          threadId: options.threadId,
          originalContent: options.html,
          accessToken: options.account.accessToken!,
        });

        return {
          messageId: email.messageId,
          threadId: email.threadId || "",
          success: true,
        };
      }
    } catch (error: any) {
      // Log error details
      if (
        error.status === 401 ||
        (error.responseCode === 535 && error.command === "AUTH XOAUTH2")
      ) {
        throw new Error("TOKEN_EXPIRED");
      }
      await this.handleSendEmailError(error, options);
      throw error;
    }
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  /**
   * Create email tracking record
   */
  private async updateEmailTracking(
    trackingId: string,
    options: SendEmailOptions,
    trackedResponse: gmail_v1.Schema$Message
  ): Promise<void> {
    logger.info("📝 Updating email tracking record");

    await prisma.emailTracking.update({
      where: {
        id: trackingId,
      },
      data: {
        messageId: trackedResponse.id || undefined,
        threadId: trackedResponse.threadId || undefined,
        status: "sent",
        events: {
          create: {
            type: "sent",
            sequenceId: options.sequenceId,
            contactId: options.contactId,
            metadata: {
              messageId: trackedResponse.id || "",
              threadId: trackedResponse.threadId || "",
              stepId: options.stepId,
            },
          },
        },
      },
    });

    logger.info("✅ Email tracking record updated");
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  /**
   * Create email tracking record
   */
  private async createEmailTrackingRecord(
    emailId: string,
    options: SendEmailOptions,
    trackedResponse: gmail_v1.Schema$Message
  ): Promise<void> {
    logger.info("📝 Creating email tracking record");

    await prisma.emailTracking.create({
      data: {
        id: emailId,
        messageId: trackedResponse.id || undefined,
        threadId: options.threadId || undefined,
        hash: emailId,
        status: "sent",
        userId: options.userId,
        sequenceId: options.sequenceId,
        contactId: options.contactId,
        stepId: options.stepId,
        metadata: {
          email: options.to,
          userId: options.userId,
          sequenceId: options.sequenceId,
          contactId: options.contactId,
          stepId: options.stepId,
        },
        sentAt: new Date(),
        events: {
          create: {
            type: "sent",
            sequenceId: options.sequenceId,
            contactId: options.contactId,
            metadata: {
              messageId: trackedResponse.id || "",
              threadId: options.threadId || "",
              stepId: options.stepId,
            },
          },
        },
      },
    });

    logger.info("✅ Email tracking record created");
  }

  // -----------------------------------------

  /**
   * Create email event record
   */
  private async createEmailEvent(
    emailId: string,
    options: SendEmailOptions,
    trackedResponse: gmail_v1.Schema$Message
  ): Promise<void> {
    logger.info("📝 Creating email event");

    // Update sequence stats for the sent event
    if (options.sequenceId && options.contactId) {
      await updateSequenceStats(options.sequenceId, "sent", options.contactId);
    }

    logger.info("✅ Email event and stats created");
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  /**
   * Handle errors during email sending process
   */
  private async handleSendEmailError(
    error: unknown,
    options: SendEmailOptions
  ): Promise<void> {
    logger.error(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        options: {
          to: options.to,
          subject: options.subject,
          threadId: options.threadId,
          account: {
            email: options.account.email,
            expiryDate: new Date(options.account.expiryDate!).toISOString(),
          },
        },
      },
      "��� Error sending email"
    );
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  /**
   * Helper function to get sent message details from Gmail
   */
  private async getSentMessageDetails(
    gmail: gmail_v1.Gmail,
    messageId: string
  ): Promise<SentMessageInfo> {
    const sentMessage = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const headers = sentMessage.data.payload?.headers || [];
    const messageIdHeader = headers.find(
      (h) => h.name?.toLowerCase() === "message-id"
    )?.value;
    const subjectHeader = headers.find(
      (h) => h.name?.toLowerCase() === "subject"
    )?.value;

    return {
      messageId: messageIdHeader || messageId,
      subject: subjectHeader || undefined,
      threadId: sentMessage.data.threadId || undefined,
      headers,
    };
  }
}

export const emailService = new EmailService();
