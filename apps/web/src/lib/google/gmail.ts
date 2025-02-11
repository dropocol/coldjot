import { google } from "googleapis";
import { encode as base64Encode } from "js-base64";
import { prisma } from "@coldjot/database";
import { gmail_v1 } from "googleapis";

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

export async function getGmailSubject(gmail: gmail_v1.Gmail, threadId: string) {
  const thread = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "metadata",
    metadataHeaders: ["subject"],
  });

  return thread.data.messages?.[0]?.payload?.headers?.find(
    (header: any) => header.name.toLowerCase() === "subject"
  )?.value;
}

export async function updateEmailSubject(
  accessToken: string,
  trackingId: string
) {
  try {
    // Get the email tracking record
    const emailTracking = await prisma.emailTracking.findUnique({
      where: { id: trackingId },
      select: { threadId: true, subject: true },
    });

    if (!emailTracking?.threadId || emailTracking.subject) {
      return; // No threadId or already has subject
    }

    const gmail = await getGmailClient(accessToken);
    const subject = await getGmailSubject(gmail, emailTracking.threadId);

    if (subject) {
      // Update the email tracking record with the subject
      await prisma.emailTracking.update({
        where: { id: trackingId },
        data: { subject },
      });
    }

    return subject;
  } catch (error) {
    console.error("Error updating email subject:", error);
    throw error;
  }
}
