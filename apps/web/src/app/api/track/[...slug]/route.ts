import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@mailjot/database";
// import { prisma } from "@mailjot/database";
import { trackEmailEvent } from "@/lib/tracking/tracking-service";
import type { EmailEventType } from "@mailjot/types";
import { getUserAgent } from "@/lib/user-agent";
import { getIpLocation } from "@/lib/ip-location";
import { updateSequenceStats } from "@/lib/stats/sequence-stats-service";
// import type { EmailEventType } from "@prisma/client";

import {
  recordEmailOpen,
  recordLinkClick,
} from "@/lib/tracking/tracking-service";
import { getGmailEmail, getGmailThread } from "@/lib/google/gmail";

const TRANSPARENT_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

// Handle email opens
async function handleEmailOpen(hash: string, request: NextRequest) {
  console.log(`📨 Processing email open for hash: ${hash}`);

  const existingEvent = await prisma.emailTrackingEvent.findUnique({
    where: { hash },
    select: {
      id: true,
      email: true,
      openCount: true,
      sequenceId: true,
      contactId: true,
      messageId: true,
      userId: true,
      gmailThreadId: true,
    },
  });

  if (!existingEvent) {
    console.error(`❌ No tracking event found for hash: ${hash}`);
    throw new Error("Invalid tracking hash");
  }

  // Get the referer header to check where the request came from
  const referer = request.headers.get("referer");
  const userAgent = request.headers.get("user-agent") || "";

  // Check specifically for Gmail compose/reply patterns
  const isGmailComposeView =
    referer?.includes("mail.google.com/mail/u/") &&
    (referer?.includes("/compose") ||
      referer?.includes("?compose=") ||
      referer?.includes("?reply=") ||
      referer?.includes("?forward="));

  if (isGmailComposeView) {
    console.log(`⏭️ Request from Gmail compose/reply view - returning 307`);
    return new NextResponse(TRANSPARENT_PIXEL, {
      status: 307,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "max-age=60, private",
        "X-Frame-Options": "deny",
        "X-Robots-Tag": "noindex, nofollow",
        Location: request.url,
      },
    });
  }

  // Skip tracking only if it's from Google/Gmail backend services
  if (
    userAgent.toLowerCase().includes("googlebot") ||
    userAgent.toLowerCase().includes("google-smtp-source") ||
    (referer && referer.includes("googleapis.com"))
  ) {
    console.log(`⏭️ Skipping tracking for request from Google/Gmail services`);
    return new NextResponse(TRANSPARENT_PIXEL, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "max-age=60, private",
        "X-Frame-Options": "deny",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  console.log(`✉️ Found email tracking event:`, {
    email: existingEvent.email,
    currentOpens: existingEvent.openCount,
  });

  // Record the open - this will handle both tracking and stats update
  await recordEmailOpen(hash);

  console.log(`✅ Recorded email open for ${existingEvent.email}`);

  return new NextResponse(TRANSPARENT_PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "max-age=60, private",
      "X-Frame-Options": "deny",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

// Handle link clicks
async function handleLinkClick(hash: string, linkId: string | null) {
  console.log(`🔗 Processing link click - Hash: ${hash}, Link ID: ${linkId}`);

  if (!linkId) {
    console.error(`❌ No link ID provided in request`);
    throw new Error("Missing link ID for click tracking");
  }

  const existingEvent = await prisma.emailTrackingEvent.findUnique({
    where: { hash },
    select: {
      id: true,
      email: true,
      sequenceId: true,
      contactId: true,
      links: {
        where: { id: linkId },
        select: {
          id: true,
          originalUrl: true,
          clickCount: true,
        },
      },
    },
  });

  if (!existingEvent) {
    console.error(`❌ No tracking event found for hash: ${hash}`);
    throw new Error("Invalid tracking hash");
  }

  console.log(`📧 Found email tracking event for: ${existingEvent.email}`);

  const trackedLink = existingEvent.links[0];
  if (!trackedLink) {
    console.error(`❌ No link found with ID: ${linkId}`);
    throw new Error("Invalid link ID");
  }

  console.log(`🔍 Found tracked link:`, {
    url: trackedLink.originalUrl,
    currentClicks: trackedLink.clickCount,
  });

  await recordLinkClick(linkId);

  // Always update stats for clicks as we want to track all clicks
  if (existingEvent.sequenceId && existingEvent.contactId) {
    // TODO: fix this
    // await updateSequenceStats(
    //   existingEvent.sequenceId,
    //   "clicked",
    //   existingEvent.contactId
    // );
  }

  console.log(`✅ Recorded link click for ${trackedLink.originalUrl}`);

  return NextResponse.redirect(trackedLink.originalUrl);
}

// Main route handler
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug?: string[] }> }
) {
  try {
    console.log(`\n🎯 New tracking request received`);
    console.log(`📝 Raw params:`, await params);
    console.log(`📝 Request headers:`, request.headers);

    // Parse the slug to get hash and action
    const { slug } = (await params) || [];
    let hash = slug![0] || "";
    const action = slug![1] || "";

    // Remove .png extension if present
    hash = hash.replace(".png", "");

    const searchParams = request.nextUrl.searchParams;
    const linkId = searchParams.get("lid");
    const isClickEvent = action === "click";

    console.log(`📝 Parsed request details:`, {
      hash,
      action,
      linkId,
      isClickEvent,
      url: request.url,
    });

    // Route to appropriate handler
    if (isClickEvent) {
      return await handleLinkClick(hash, linkId);
    } else {
      return await handleEmailOpen(hash, request);
    }
  } catch (error) {
    console.error(`❌ Error processing tracking request:`, error);

    if (process.env.NODE_ENV === "development") {
      return new NextResponse(
        `<html>
          <head>
            <title>Tracking Error</title>
            <style>
              body { 
                font-family: system-ui; 
                padding: 20px; 
                max-width: 800px;
                margin: 0 auto;
                line-height: 1.6;
              }
              .error-box {
                background: #fef2f2;
                border: 1px solid #fecaca;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
              }
              .error-message {
                color: #dc2626;
                font-weight: 500;
              }
              .error-details {
                margin-top: 15px;
                padding: 15px;
                background: #f8fafc;
                border-radius: 6px;
              }
            </style>
          </head>
          <body>
            <h1>❌ Tracking Error</h1>
            <div class="error-box">
              <p class="error-message">${
                error instanceof Error ? error.message : "Unknown error"
                // TODO: Add back in
                // <p><strong>Hash:</strong> ${params.slug?.[0] || "N/A"}</p>
                // <p><strong>Action:</strong> ${params.slug?.[1] || "N/A"}</p>
              }</p>
              <div class="error-details">
                <p><strong>Hash:</strong>"N/A"</p>
                <p><strong>Action:</strong>"N/A"</p>
                <p><strong>URL:</strong> ${request.url}</p>
              </div>
            </div>
          </body>
        </html>`,
        {
          headers: { "Content-Type": "text/html" },
          status: 400,
        }
      );
    }

    return new NextResponse(TRANSPARENT_PIXEL, {
      headers: { "Content-Type": "image/gif" },
    });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventType: string }> }
) {
  try {
    const { emailId } = await req.json();
    const eventType = (await params).eventType.toUpperCase();

    if (!emailId) {
      return NextResponse.json(
        { error: "Email ID is required" },
        { status: 400 }
      );
    }

    const userAgent = getUserAgent(req);
    const ipAddress =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const location = await getIpLocation(ipAddress);

    const event = await trackEmailEvent(emailId, eventType as EmailEventType, {
      userAgent: userAgent.userAgent,
      ipAddress,
      location: JSON.stringify(location),
      deviceType: userAgent.device,
    });

    return NextResponse.json({ success: true, event });
  } catch (error) {
    console.error(`❌ Error tracking email event:`, error);
    return NextResponse.json(
      { error: "Failed to track email event" },
      { status: 500 }
    );
  }
}