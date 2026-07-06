/**
 * Adapter interface — abstracts the Gmail REST surface the watch service uses
 * (getProfile + users.stop + users.watch + the POST watch endpoint).
 *
 * Phase 7: extracted so `WatchService` can be unit/integration-tested with a
 * fake gateway instead of stubbing global `fetch` + constructing an OAuth2
 * client. The default `GmailWatchGateway` implementation preserves the exact
 * pre-refactor behavior (same `fetch` calls, same OAuth2 construction).
 */
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { GMAIL_API } from "@/config/watch/constants";
import type { WatchResponse } from "@coldjot/types";

/** Result of a profile lookup — just the historyId the watch service needs. */
export interface ProfileResult {
  historyId: string;
}

export interface WatchGateway {
  /** Fetch the mailbox profile (current historyId). */
  getProfile(accessToken: string): Promise<ProfileResult>;
  /** Stop any existing watch on the mailbox. Idempotent — errors swallowed. */
  stop(accessToken: string): Promise<void>;
  /** Set up a new PubSub watch on `topicName`. */
  watch(accessToken: string, topicName: string): Promise<WatchResponse>;
  /** POST the watch request directly (used by renew). */
  createWatchRequest(accessToken: string): Promise<WatchResponse>;
}

/**
 * Build a gmail handle from a raw access token + optional refresh/expiry.
 * Shared by the default gateway impls below. Kept as a standalone fn so tests
 * don't construct a real OAuth2 client unless they choose to.
 */
function gmailFromToken(
  oauth2Client: OAuth2Client,
  accessToken: string,
  refreshToken?: string | null,
  expiresAt?: number | null
) {
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken || undefined,
    expiry_date: expiresAt ? expiresAt * 1000 : undefined,
  });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

/**
 * Default `WatchGateway` — the live Gmail REST implementation. Constructs its
 * own OAuth2 client from env (same as the pre-refactor WatchService did) and
 * hits Gmail directly. `WatchService` defaults to this; tests inject a fake.
 */
export class GmailWatchGateway implements WatchGateway {
  private readonly oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID_EMAIL,
    process.env.GOOGLE_CLIENT_SECRET_EMAIL,
    process.env.GOOGLE_REDIRECT_URI_EMAIL
  );

  async getProfile(accessToken: string): Promise<ProfileResult> {
    const gmail = gmailFromToken(this.oauth2Client, accessToken);
    const profile = await gmail.users.getProfile({ userId: "me" });
    const historyId = profile.data.historyId?.toString();
    if (!historyId) throw new Error("Could not get current history ID from Gmail");
    return { historyId };
  }

  async stop(accessToken: string): Promise<void> {
    const gmail = gmailFromToken(this.oauth2Client, accessToken);
    await gmail.users.stop({ userId: "me" });
  }

  async watch(accessToken: string, topicName: string): Promise<WatchResponse> {
    const gmail = gmailFromToken(this.oauth2Client, accessToken);
    const response = await gmail.users.watch({
      userId: "me",
      requestBody: { topicName },
    });
    return response.data as WatchResponse;
  }

  async createWatchRequest(accessToken: string): Promise<WatchResponse> {
    const response = await fetch(GMAIL_API.WATCH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ topicName: process.env.PUBSUB_TOPIC_NAME }),
    });
    if (!response.ok) {
      const errorData = (await response.json()) as any;
      throw {
        code: errorData.error?.code || "unknown_error",
        message: errorData.error?.message || "Failed to create watch",
        status: response.status,
      };
    }
    return (await response.json()) as WatchResponse;
  }
}
