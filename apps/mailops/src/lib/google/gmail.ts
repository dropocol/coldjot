import { google, gmail_v1 } from "googleapis";

export async function getGmailClient(
  accessToken: string
): Promise<gmail_v1.Gmail> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth });
}

export async function getGmailSubject(
  gmail: gmail_v1.Gmail,
  threadId: string
): Promise<string | undefined> {
  const thread = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "metadata",
    metadataHeaders: ["subject"],
  });

  const subjectHeader = thread.data.messages?.[0]?.payload?.headers?.find(
    (header: any) => header.name.toLowerCase() === "subject"
  );

  return subjectHeader?.value || undefined;
}
