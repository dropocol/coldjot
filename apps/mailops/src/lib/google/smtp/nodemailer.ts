import nodemailer from "nodemailer";
import { google } from "googleapis";
import { createTransport, TransportOptions } from "nodemailer";
import { logger } from "@/lib/log";

export async function createGmailTransport(
  accessToken: string,
  refreshToken: string,
  userEmail: string,
  userName?: string
) {
  // Create SMTP transport
  const transport = await nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: userEmail,
      clientId: process.env.GOOGLE_CLIENT_ID_EMAIL,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET_EMAIL,
      refreshToken: refreshToken,
      accessToken: accessToken,
      // Add OAuth2 refresh token handler
      oauth2: {
        refreshToken: refreshToken,
        accessToken: accessToken,
        expires: 3599,
        refreshAccessToken: async () => {
          try {
            const oauth2Client = new google.auth.OAuth2(
              process.env.GOOGLE_CLIENT_ID_EMAIL,
              process.env.GOOGLE_CLIENT_SECRET_EMAIL,
              process.env.GOOGLE_REDIRECT_URI_EMAIL
            );
            oauth2Client.setCredentials({
              refresh_token: refreshToken,
            });
            const { token } = await oauth2Client.getAccessToken();
            // NOTE: do not log the token value here — it's a live credential.
            logger.debug("Refreshed SMTP access token");
            return token;
          } catch (error) {
            logger.error("Error refreshing access token:", error);
            throw error;
          }
        },
      },
    },
    pool: true, // Use pooled connections
    maxConnections: 5, // Maximum number of simultaneous connections
    maxMessages: 100, // Maximum number of messages per connection
    rateDelta: 1000, // How many milliseconds between messages
    rateLimit: 5, // Maximum number of messages per rateDelta
  } as TransportOptions);

  // Verify SMTP connection configuration
  try {
    await new Promise((resolve, reject) => {
      transport.verify((error) => {
        if (error) {
          logger.error("SMTP Connection Error:", error);
          reject(error);
        } else {
          logger.debug("SMTP Connection Successful");
          resolve(true);
        }
      });
    });
  } catch (error) {
    logger.error("Failed to verify SMTP connection:", error);
    throw error;
  }

  return transport;
}
