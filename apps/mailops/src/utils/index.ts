export * from "./email";
import { AppUrlEnum, AppUrlType } from "@coldjot/types";
import { logger } from "@/lib/log";
// Sleep utility
export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const getBaseUrl = (type: AppUrlType = AppUrlEnum.API) => {
  // API URL
  if (type === AppUrlEnum.API) {
    const apiUrl = process.env.MAILOPS_API_URL;
    if (!apiUrl) {
      logger.warn({ type: "API" }, "MAILOPS_API_URL not set — falling back to localhost");
      return "http://localhost:3001";
    }
    return apiUrl;
  }

  // Mailops URL
  if (type === AppUrlEnum.MAILOPS) {
    const mailopsUrl = process.env.MAILOPS_API_URL;
    if (!mailopsUrl) {
      logger.warn({ type: "MAILOPS" }, "MAILOPS_API_URL not set — falling back to localhost");
      return "http://localhost:3001";
    }
    return mailopsUrl;
  }

  // TRACKING URL — public base baked into every outgoing email (pixel + click
  // links). Required: emitting tracking links to an uncontrolled host is worse
  // than failing the send. Dev: Cloudflare Tunnel host; prod: tracking.coldjot.com.
  if (type === AppUrlEnum.TRACKING) {
    const trackingUrl = process.env.TRACK_API_URL;
    if (!trackingUrl) {
      throw new Error("TRACK_API_URL is required (set it to your public tunnel host)");
    }
    return trackingUrl;
  }

  // WEB URL
  const webAppUrl = process.env.WEB_APP_URL;

  if (!webAppUrl) {
    logger.warn({ type: "WEB" }, "WEB_APP_URL not set — falling back to localhost");
    return "http://localhost:3000";
  }
  return webAppUrl;
};
