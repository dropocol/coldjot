import { google } from "googleapis";
import { encode as base64Encode } from "js-base64";

import type { gmail_v1 } from "googleapis";
import { logger } from "@/lib/log";
import { PrismaMailboxRepository } from "@/repositories/prisma/prisma-mailbox.repo";
import {
  validateGmailCredentials,
  refreshTokenIfNeeded,
  setOAuth2Credentials,
} from "./helper";

import type {
  GmailClientConfig,
  CreateDraftOptions,
  SendDraftOptions,
} from "@coldjot/types";


// Gmail Client Class
export class GmailClientService {
  private static instance: GmailClientService;
  private config: GmailClientConfig;
  // TODO(phase-6): inject via createApp() once ServiceManager is unwound.
  // For now, default to the Prisma impl — overridable for tests.
  private readonly mailboxRepo = new PrismaMailboxRepository();

  // TODO: Move to config
  private constructor() {
    this.config = {
      clientId: process.env.GOOGLE_CLIENT_ID_EMAIL!,
      clientSecret: process.env.GOOGLE_SECRET_EMAIL!,
      redirectUri: process.env.GOOGLE_REDIRECT_URI_EMAIL!,
    };
  }

  // -------------------------------------------------------

  public static getInstance(): GmailClientService {
    if (!GmailClientService.instance) {
      GmailClientService.instance = new GmailClientService();
    }
    return GmailClientService.instance;
  }

  // -------------------------------------------------------
  /**
   * Create an OAuth2 client with the provided configuration
   */
  private createOAuth2Client() {
    return new google.auth.OAuth2(
      this.config.clientId,
      this.config.clientSecret,
      this.config.redirectUri
    );
  }

  // -------------------------------------------------------

  /**
   * Get a Gmail client instance with automatic token refresh
   */
  // public async getClient(options: MailboxCredentials): Promise<gmail_v1.Gmail> {
  public async getClient(
    userId: string,
    mailboxId: string
  ): Promise<gmail_v1.Gmail> {
    try {
      logger.info(
        {
          userId: userId,
        },
        "🔄 Initializing Gmail client"
      );

      // Lets get user mailbox here instead of passing it in
      const mailbox = await this.mailboxRepo.findByIdForUser(mailboxId, userId);

      if (!mailbox) {
        throw new Error("Mailbox not found");
      }

      const credentials = {
        userId: mailbox.userId,
        mailboxId: mailbox.id,
        accessToken: mailbox.access_token!,
        refreshToken: mailbox.refresh_token!,
        expiryDate: mailbox.expires_at!,
      };

      // Validate credentials
      validateGmailCredentials(credentials);

      // Create OAuth2 client
      const auth = this.createOAuth2Client();

      // Refresh token if needed and get the current valid access token
      const currentAccessToken = await refreshTokenIfNeeded(credentials);

      // Set the credentials with the current access token
      setOAuth2Credentials(auth, currentAccessToken, credentials);

      logger.info("🔄 OAuth2 client credentials set");

      // Create and return the Gmail client
      const gmail = google.gmail({ version: "v1", auth });

      logger.info({ userId: userId }, "✅ Gmail client created successfully");

      return gmail;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          userId: userId,
        },
        "❌ Failed to create Gmail client"
      );
      throw error;
    }
  }
}


/**
 * @deprecated This method will be removed in the next major release.
 */

export async function createGmailDraft({
  accessToken,
  to,
  subject,
  content,
}: CreateDraftOptions) {
  try {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID_EMAIL,
      process.env.GOOGLE_CLIENT_SECRET_EMAIL,
      process.env.GOOGLE_REDIRECT_URI_EMAIL
    );

    auth.setCredentials({
      access_token: accessToken,
      token_type: "Bearer",
    });

    const gmail = google.gmail({ version: "v1", auth });

    try {
      // Try with current access token
      const message = [
        "Content-Type: text/html; charset=utf-8",
        "MIME-Version: 1.0",
        `To: ${to}`,
        `Subject: ${subject}`,
        "",
        content,
      ].join("\n");

      const encodedMessage = base64Encode(message)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const response = await gmail.users.drafts.create({
        userId: "me",
        requestBody: {
          message: {
            raw: encodedMessage,
          },
        },
      });

      return response.data.id;
    } catch (error: any) {
      if (error.status === 401) {
        throw new Error("TOKEN_EXPIRED");
      }
      throw error;
    }
  } catch (error) {
    logger.error({ err: error }, "Error creating Gmail draft");
    throw error;
  }
}


/**
 * @deprecated This method will be removed in the next major release.
 */

export async function sendGmailDraft({
  accessToken,
  draftId,
}: SendDraftOptions) {
  try {
    // Set up new credentials for this request
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID_EMAIL,
      process.env.GOOGLE_CLIENT_SECRET_EMAIL,
      process.env.GOOGLE_REDIRECT_URI_EMAIL
    );

    auth.setCredentials({
      access_token: accessToken,
      token_type: "Bearer",
    });

    const gmail = google.gmail({ version: "v1", auth });

    const response = await gmail.users.drafts.send({
      userId: "me",
      requestBody: {
        id: draftId,
      },
    });

    return response.data;
  } catch (error) {
    logger.error({ err: error }, "Error sending Gmail draft");
    throw error;
  }
}


export async function getGmailEmail(accessToken: string, messageId: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID_EMAIL,
    process.env.GOOGLE_CLIENT_SECRET_EMAIL,
    process.env.GOOGLE_REDIRECT_URI_EMAIL
  );

  auth.setCredentials({
    access_token: accessToken,
    token_type: "Bearer",
  });

  const gmail = google.gmail({ version: "v1", auth });

  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  return response.data;
}


export async function getGmailThread(accessToken: string, threadId: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID_EMAIL,
    process.env.GOOGLE_CLIENT_SECRET_EMAIL,
    process.env.GOOGLE_REDIRECT_URI_EMAIL
  );

  auth.setCredentials({
    access_token: accessToken,
    token_type: "Bearer",
  });

  const gmail = google.gmail({ version: "v1", auth });

  const response = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
  });

  return response.data;
}


// Export singleton instance
export const gmailClientService = GmailClientService.getInstance();
