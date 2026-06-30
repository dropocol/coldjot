import { NextRequest, NextResponse } from "next/server";
import { EmailEventEnum } from "@coldjot/types";
import { getUserAgent } from "@/lib/user-agent";
import { getIpLocation } from "@/lib/ip-location";
import { getClientIp } from "@/lib/http/ip";
import { parseBody } from "@/lib/http/validation";
import {
  MAILOPS_BASE_URL,
  mailopsAuthHeaders,
} from "@/lib/http/mailops";
import { z } from "zod";

// Transparent 1x1 pixel for email-open tracking.
const TRANSPARENT_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

const trackEventSchema = z.object({
  emailId: z.string().min(1),
});

/**
 * Email event tracking endpoint. This is intentionally PUBLIC (no session) —
 * it's called by email clients when recipients open messages or click links.
 *
 * Previously this was a no-op: the recording call to mailops was commented
 * out, so no open/click events were ever recorded. It now proxies the event
 * to the mailops tracking service.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventType: string }> }
) {
  try {
    const { eventType } = await params;
    const normalized = eventType.toLowerCase();

    // Validate eventType against the enum — previously accepted any string,
    // allowing arbitrary event types to be written to the analytics tables.
    if (!Object.values(EmailEventEnum).includes(normalized as EmailEventEnum)) {
      return NextResponse.json(
        { error: "Invalid event type" },
        { status: 400 }
      );
    }

    const body = await parseBody(req, trackEventSchema);
    if (!body.ok) return body.response;
    const { emailId } = body.data;

    const mailopsUrl = MAILOPS_BASE_URL;
    if (!mailopsUrl) {
      console.error("[EMAIL_TRACK] NEXT_PUBLIC_MAILOPS_API_URL is not set");
      return NextResponse.json(
        { error: "Tracking service not configured" },
        { status: 502 }
      );
    }

    // Parse the client IP correctly (first hop of x-forwarded-for) instead of
    // trusting the entire raw, spoofable header value.
    const ip = getClientIp(req);
    const userAgent = getUserAgent(req);
    const location = ip
      ? await getIpLocation(ip)
      : { country: undefined, city: undefined, region: undefined };

    // Proxy the event to the mailops tracking service.
    const response = await fetch(`${mailopsUrl}/api/track/events`, {
      method: "POST",
      headers: {
        ...mailopsAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        trackingId: emailId,
        eventType: normalized,
        metadata: {
          userAgent: userAgent.userAgent,
          ipAddress: ip,
          location: JSON.stringify(location),
          deviceType: userAgent.device,
          browser: userAgent.browser,
          os: userAgent.os,
        },
      }),
    });

    if (!response.ok) {
      console.error(
        "[EMAIL_TRACK] mailops tracking responded with",
        response.status
      );
      // Return 200 anyway so email clients don't retry — tracking is best-effort.
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[EMAIL_TRACK] Error processing event request:", error);
    // Best-effort: don't surface 500s to email clients (they'd retry).
    return NextResponse.json({ success: true });
  }
}

/** Serve the transparent tracking pixel (GET), for <img>-based open tracking. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventType: string }> }
) {
  try {
    const { eventType } = await params;
    const normalized = eventType.toLowerCase();

    // Only the "opened" event makes sense for an <img> pixel GET.
    if (normalized !== EmailEventEnum.OPENED) {
      return new NextResponse(TRANSPARENT_PIXEL, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "max-age=60, private",
          "X-Frame-Options": "deny",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }

    const emailId = new URL(req.url).searchParams.get("emailId");
    if (!emailId) {
      return new NextResponse(TRANSPARENT_PIXEL, {
        headers: { "Content-Type": "image/png" },
      });
    }

    const mailopsUrl = MAILOPS_BASE_URL;
    if (mailopsUrl) {
      const ip = getClientIp(req);
      const userAgent = getUserAgent(req);
      const location = ip
        ? await getIpLocation(ip)
        : { country: undefined, city: undefined, region: undefined };

      await fetch(`${mailopsUrl}/api/track/events`, {
        method: "POST",
        headers: {
          ...mailopsAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackingId: emailId,
          eventType: normalized,
          metadata: {
            userAgent: userAgent.userAgent,
            ipAddress: ip,
            location: JSON.stringify(location),
            deviceType: userAgent.device,
            browser: userAgent.browser,
            os: userAgent.os,
          },
        }),
      }).catch(() => {
        /* best-effort */
      });
    }

    return new NextResponse(TRANSPARENT_PIXEL, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "max-age=60, private",
        "X-Frame-Options": "deny",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    console.error("[EMAIL_TRACK] Error serving pixel:", error);
    return new NextResponse(TRANSPARENT_PIXEL, {
      headers: { "Content-Type": "image/png" },
    });
  }
}
