import { google } from "googleapis";
import { encode as base64Encode } from "js-base64";
import { prisma } from "@coldjot/database";
import { gmail_v1 } from "googleapis";

import { refreshAccessToken, refreshEmailAccessToken } from "./google-account";
import { Prisma, Mailbox } from "@prisma/client";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.AUTH_URL}/api/auth/callback/google`
);

interface CreateDraftOptions {
  accessToken: string;
  to: string;
  subject: string;
  content: string;
}

interface SendDraftOptions {
  accessToken: string;
  draftId: string;
}

interface MailboxCredentials {
  mailboxId: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number | null;
}

type MailboxSelect = {
  id: true;
  userId: true;
  access_token: true;
  refresh_token: true;
  expires_at: true;
};

type SequenceMailboxWithMailbox = {
  mailbox: {
    id: string;
    userId: string;
    access_token: string;
    refresh_token: string;
    expires_at: number | null;
  };
};

/**
 * Check if the access token needs to be refreshed
 * Refreshes token if it's about to expire within 5 minutes
 */
export function shouldRefreshToken(credentials: MailboxCredentials): boolean {
  const expiryDate = credentials.expiryDate
    ? credentials.expiryDate * 1000
    : new Date().getTime();

  const now = new Date().getTime() + 5 * 60 * 1000; // 5 minutes buffer
  const needsRefresh = Boolean(expiryDate && expiryDate < now);

  if (needsRefresh) {
  }

  return needsRefresh;
}

/**
 * Refresh the access token if needed for email operations
 * Returns the current valid access token (either refreshed or existing)
 */
export async function refreshEmailTokenIfNeeded(
  credentials: MailboxCredentials
): Promise<string> {
  try {
    if (shouldRefreshToken(credentials)) {
      console.log("🔄 Attempting to refresh email access token", {
        userId: credentials.userId,
      });

      const newAccessToken = await refreshEmailAccessToken(
        credentials.userId,
        credentials.refreshToken
      );

      if (!newAccessToken) {
        throw new Error("Failed to refresh email access token");
      }

      console.log("✅ Email access token refreshed successfully", {
        userId: credentials.userId,
      });

      return newAccessToken;
    }

    return credentials.accessToken;
  } catch (error) {
    console.error("❌ Failed to refresh email access token", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      userId: credentials.userId,
    });
    throw error;
  }
}

export async function getGmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.AUTH_URL}/api/auth/callback/google`
  );

  auth.setCredentials({
    access_token: accessToken,
    token_type: "Bearer",
  });

  return google.gmail({ version: "v1", auth });
}

export async function getGmailEmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID_EMAIL,
    process.env.GOOGLE_CLIENT_SECRET_EMAIL,
    process.env.GOOGLE_REDIRECT_URI_EMAIL
  );

  auth.setCredentials({
    access_token: accessToken,
    token_type: "Bearer",
  });

  return google.gmail({ version: "v1", auth });
}

export async function createGmailDraft({
  accessToken,
  to,
  subject,
  content,
}: CreateDraftOptions) {
  try {
    const gmail = await getGmailClient(accessToken);

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
    console.error("Error creating Gmail draft:", error);
    throw error;
  }
}

export async function sendGmailDraft({
  accessToken,
  draftId,
}: SendDraftOptions) {
  try {
    const gmail = await getGmailClient(accessToken);

    const response = await gmail.users.drafts.send({
      userId: "me",
      requestBody: {
        id: draftId,
      },
    });

    return response.data;
  } catch (error) {
    console.error("Error sending Gmail draft:", error);
    throw error;
  }
}

export async function getGmailEmail(accessToken: string, messageId: string) {
  const gmail = await getGmailEmailClient(accessToken);

  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  return response.data;
}

export async function getGmailThread(accessToken: string, threadId: string) {
  const gmail = await getGmailClient(accessToken);

  const response = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
  });

  return response.data;
}

export async function getGmailSubject(
  gmail: gmail_v1.Gmail,
  threadId: string
): Promise<string | undefined> {
  try {
    const thread = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "metadata",
      metadataHeaders: ["subject"],
    });

    const subject = thread.data.messages?.[0]?.payload?.headers?.find(
      (header: any) => header.name.toLowerCase() === "subject"
    )?.value;

    return subject || undefined;
  } catch (error) {
    console.error("Failed to get Gmail subject", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      threadId,
    });
    return undefined;
  }
}

export async function updateEmailSubject(
  accessToken: string,
  trackingId: string
) {
  try {
    // Get the email tracking record
    const emailTracking = await prisma.emailTracking.findUnique({
      where: { id: trackingId },
      select: {
        threadId: true,
        subject: true,
        sequenceId: true,
      },
    });

    if (!emailTracking?.threadId || emailTracking.subject) {
      return; // No threadId or already has subject
    }

    // Get sequence mailbox for credentials
    const sequenceMailbox = (await prisma.sequenceMailbox.findUnique({
      where: { sequenceId: emailTracking.sequenceId! },
      include: {
        mailbox: {
          select: {
            id: true,
            userId: true,
            access_token: true,
            refresh_token: true,
            expires_at: true,
          },
        },
      },
    })) as SequenceMailboxWithMailbox | null;

    if (
      !sequenceMailbox?.mailbox?.access_token ||
      !sequenceMailbox.mailbox.refresh_token
    ) {
      console.error("No valid mailbox credentials found for sequence", {
        sequenceId: emailTracking.sequenceId,
        trackingId,
      });
      return;
    }

    // Prepare credentials for token refresh
    const credentials: MailboxCredentials = {
      mailboxId: sequenceMailbox.mailbox.id,
      userId: sequenceMailbox.mailbox.userId,
      accessToken: sequenceMailbox.mailbox.access_token,
      refreshToken: sequenceMailbox.mailbox.refresh_token,
      expiryDate: sequenceMailbox.mailbox.expires_at,
    };

    // Get fresh access token using email-specific refresh
    const freshAccessToken = await refreshEmailTokenIfNeeded(credentials);

    // Get Gmail client with fresh token
    const gmail = await getGmailEmailClient(freshAccessToken);
    const subject = await getGmailSubject(gmail, emailTracking.threadId);

    if (typeof subject === "string") {
      await prisma.emailTracking.update({
        where: { id: trackingId },
        data: { subject },
      });
    }
  } catch (error) {
    console.error("Failed to update email subject", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      trackingId,
    });
    throw error;
  }
}
