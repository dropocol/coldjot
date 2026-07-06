import {
  EmailEventEnum,
  EmailLabelEnum,
  type EmailResult,
  type SendEmailOptions,
} from "@coldjot/types";
import type { Db } from "@coldjot/database";
import { logger } from "@/lib/log";
import { updateSequenceStats } from "@/lib/stats";
import { addTrackingToEmail } from "@/lib/tracking/link-wrap";
import { getEmailThreadInfo } from "@/lib/google/gmail/helper";
import {
  createEmailMessage,
  createUntrackedMessage,
  generateSenderInfo,
} from "@/lib/email/helper";

import type { MailTransport } from "@/adapters/mail-transport";
import { GmailTransport } from "@/adapters/gmail-transport";
import { prisma } from "@coldjot/database";

/**
 * Domain service interface — sends an email and writes the tracking row +
 * SENT event. Phase 4b replaces EmailService behind this contract.
 */
export interface SendEmailService {
  send(options: SendEmailOptions): Promise<EmailResult>;
}

/**
 * Live `SendEmailServiceImpl` — the canonical email-send orchestrator.
 *
 * Extracted from lib/email/index.ts's EmailService in Phase 4b. The body is
 * the Gmail-API path only — the dead `useApi = false` SMTP branch, the stray
 * `null;`, the unused `createEmailTrackingRecord`, and `handleSendEmailError`
 * (a one-line logger) are all gone. Behavior is otherwise identical:
 *   - disableSending shortcut returns fake IDs but still writes tracking + event
 *   - 1s delay between send and get-details (Gmail propagation wait)
 *   - untracked-copy insert + delete-original (delete errors logged, not thrown)
 *   - 401 / 535+AUTH XOAUTH2 → throws TOKEN_EXPIRED
 *
 * mailops v2: data access goes through the `db` client's domain extension
 * methods (`db.emailTracking.markSent`, `db.trackedLink.create`, etc.). The
 * transport is the only non-db collaborator.
 */
export class SendEmailServiceImpl implements SendEmailService {
  constructor(
    private readonly db: Db,
    private readonly transport: MailTransport
  ) {}

  async send(options: SendEmailOptions): Promise<EmailResult> {
    try {
      logger.info("📧 Starting email send process");

      // disableSending shortcut: fake IDs, no Gmail calls, tracking + event
      // still written (current behavior, pinned by Group A case 2).
      if (options.disableSending) {
        logger.info("🚫 Email sending disabled - returning fake IDs");
        const threadId = options.threadId || `fake-thread-${Date.now()}`;
        const messageId = `fake-msg-${Date.now()}`;

        await this.markTrackingSent(options, { id: messageId, threadId });
        await this.recordSentEvent(options);

        return { success: true, messageId, threadId, isFake: true };
      }

      const mailboxId = options.mailbox!.id!;

      // Get a client for the thread-info + untracked-message helpers (they
      // need a gmail handle). The transport does its own client fetching for
      // send/insert/delete/get.
      const gmail = await this.transport.getClient(options.userId, mailboxId);

      const senderInfo = await generateSenderInfo(options.mailbox);
      const { threadHeaders, originalSubject } = await getEmailThreadInfo(
        gmail,
        options.threadId
      );

      // Tracked content for the recipient (links wrapped + pixel appended).
      const trackedContent = await addTrackingToEmail(
        options.html,
        options.tracking,
        async (id, url) =>
          (
            await this.db.trackedLink.createLink({
              emailTrackingId: id,
              originalUrl: url,
            })
          ).id
      );

      const encodedMessage = createEmailMessage({
        fromHeader: senderInfo.header,
        to: options.to,
        subject: options.subject,
        content: trackedContent,
        threadId: options.threadId,
        originalSubject: originalSubject || options.subject,
        threadHeaders,
      });

      const { id, threadId } = await this.transport.send({
        userId: options.userId,
        mailboxId,
        raw: encodedMessage,
        threadId: options.threadId,
      });

      // Wait for Gmail to process the message and get the actual Message-ID.
      // TODO(Phase 7): revisit whether this delay is still needed.
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const details = await this.transport.getSentDetails(
        id,
        options.userId,
        mailboxId
      );
      if (details.messageId) {
        threadHeaders.messageId = details.messageId;
      }

      // Untracked copy for the sender's sent folder.
      if (options.html) {
        const encodedUntrackedMessage = await createUntrackedMessage({
          gmail,
          messageId: id,
          to: options.to,
          subject: details.subject || options.subject,
          originalContent: options.html,
          threadId: details.threadId,
          originalSubject: originalSubject || options.subject,
          threadHeaders,
        });

        await this.transport.insert({
          userId: options.userId,
          mailboxId,
          raw: encodedUntrackedMessage,
          threadId: details.threadId,
          labelIds: [EmailLabelEnum.SENT],
        });

        // Delete the original tracked message from the sent folder. Errors
        // are logged but not thrown (current behavior).
        try {
          await this.transport.delete(id, options.userId, mailboxId);
          logger.info("✅ Original tracked message deleted from sent folder");
        } catch (err) {
          logger.error({ err }, "Error deleting original tracked message");
        }
      }

      await this.markTrackingSent(options, { id, threadId });
      await this.recordSentEvent(options);

      logger.info(
        `✨ Email sending process completed successfully ${id} --- ${threadId}`
      );

      return { success: true, messageId: id, threadId: threadId! };
    } catch (error: any) {
      // Auth-failure contract: 401 or SMTP 535/AUTH XOAUTH2 → TOKEN_EXPIRED.
      if (
        error.status === 401 ||
        (error.responseCode === 535 && error.command === "AUTH XOAUTH2")
      ) {
        throw new Error("TOKEN_EXPIRED");
      }
      logger.error(
        {
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          options: {
            to: options.to,
            subject: options.subject,
            threadId: options.threadId,
            mailbox: options.mailbox
              ? {
                  email: options.mailbox.email,
                  expiryDate: options.mailbox.expiryDate
                    ? new Date(options.mailbox.expiryDate).toISOString()
                    : undefined,
                }
              : undefined,
          },
        },
        "Error sending email"
      );
      throw error;
    }
  }

  /** Write the SENT status + nested SENT event onto the tracking row. */
  private async markTrackingSent(
    options: SendEmailOptions,
    sent: { id: string; threadId?: string }
  ): Promise<void> {
    logger.info("📝 Updating email tracking record");
    await this.db.emailTracking.markSent(
      options.tracking.id,
      {
        messageId: sent.id,
        threadId: sent.threadId,
      },
      options.subject,
      options.sequenceId,
      options.contactId,
      {
        messageId: sent.id,
        threadId: sent.threadId ?? "",
        stepId: options.stepId,
      }
    );
    logger.info("✅ Email tracking record updated");
  }

  /** Bump sequence stats for the SENT event (the live stats path). */
  private async recordSentEvent(options: SendEmailOptions): Promise<void> {
    logger.info(
      { contactId: options.contactId, sequenceId: options.sequenceId },
      "📝 Creating email event"
    );
    if (options.sequenceId && options.contactId) {
      await updateSequenceStats(
        options.sequenceId,
        EmailEventEnum.SENT,
        options.contactId
      );
    }
    logger.info("✅ Email event and stats created");
  }
}

/**
 * Process-wide singleton — used by the EmailProcessor until sub-plan 2
 * converts the processor to take `db` + the service via the composition root.
 */
export const sendEmailService = new SendEmailServiceImpl(prisma, new GmailTransport());
