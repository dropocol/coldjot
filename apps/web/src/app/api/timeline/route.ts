import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";
import { getGmailEmail, updateEmailSubject } from "@/lib/google/gmail";
import type { EmailTracking, EmailEvent, TrackedLink } from "@/types/email";

// Helper function to transform raw email data
function transformEmailData(email: any): EmailTracking {
  // Calculate opens from events
  const openEvents = email.events.filter((e: any) => e.type === "opened");
  const openCount = openEvents.length;

  // Sort events by timestamp to get the first open
  const sortedOpenEvents = [...openEvents].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const firstOpenAt =
    sortedOpenEvents.length > 0
      ? new Date(sortedOpenEvents[sortedOpenEvents.length - 1].timestamp)
      : null;

  // Calculate clicks from events and links
  const clickEvents = email.events.filter((e: any) => e.type === "clicked");
  const sortedClickEvents = [...clickEvents].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const firstClickAt =
    sortedClickEvents.length > 0
      ? new Date(sortedClickEvents[sortedClickEvents.length - 1].timestamp)
      : null;

  // Calculate total clicks from links
  const totalClicks = email.links.reduce((total: number, link: any) => {
    return total + (link.clickCount || 0);
  }, 0);

  // Get sent timestamp from events or fallback to email.sentAt
  const sentEvent = email.events.find((e: any) => e.type === "sent");
  const sentAt =
    email.sentAt || (sentEvent ? new Date(sentEvent.timestamp) : null);

  return {
    id: email.id,
    messageId: email.messageId || "",
    subject: email.subject || "No Subject",
    previewText: email.previewText,
    recipientEmail: email.contact?.email || "unknown@email.com",
    status: email.status,
    metadata: email.metadata || {},
    sequenceId: email.sequenceId || "",
    stepId: email.stepId,
    contactId: email.contactId,
    userId: email.userId || "",
    openCount: openCount,
    sentAt: sentAt,
    openedAt: firstOpenAt,
    clickedAt: firstClickAt,
    createdAt: email.createdAt,
    updatedAt: email.updatedAt,
    contact: email.contact
      ? {
          name: email.contact.name,
          email: email.contact.email,
        }
      : null,
    events: email.events.map((event: any) => ({
      id: event.id,
      type: event.type,
      timestamp: new Date(event.timestamp),
      metadata: event.metadata,
    })),
    links: email.links.map((link: any) => ({
      id: link.id,
      originalUrl: link.originalUrl,
      clickCount: link.clickCount || 0,
    })),
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "20");
    const status = searchParams.get("status");
    const date = searchParams.get("date");
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const skip = (page - 1) * limit;

    // Build where clause
    const where = {
      userId,
      status: status && status !== "all" ? status : undefined,
      sentAt: date
        ? {
            gte: new Date(date),
            lt: new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000),
          }
        : undefined,
    };

    // Get emails with tracking data
    const [rawEmails, total] = await Promise.all([
      prisma.emailTracking.findMany({
        where,
        include: {
          contact: {
            select: {
              name: true,
              email: true,
            },
          },
          events: {
            orderBy: {
              timestamp: "desc",
            },
          },
          links: true,
        },
        orderBy: [
          {
            sentAt: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        skip,
        take: limit,
      }),
      prisma.emailTracking.count({ where }),
    ]);

    // Transform and sort emails
    const emails = rawEmails.map(transformEmailData).sort((a, b) => {
      const dateA = a.sentAt ? new Date(a.sentAt).getTime() : 0;
      const dateB = b.sentAt ? new Date(b.sentAt).getTime() : 0;
      return dateB - dateA;
    });

    // return NextResponse.json({
    //   emails: Array(30).fill(emails).flat(),
    //   total: 200,
    //   page: 1,
    //   limit: 20,
    //   hasMore: skip + emails.length < total,
    //   nextPage: skip + emails.length < total ? page + 1 : undefined,
    // });

    return NextResponse.json({
      emails: Array(100).fill(emails).flat(),
      total,
      page,
      limit,
      hasMore: skip + emails.length < total,
      nextPage: skip + emails.length < total ? page + 1 : undefined,
    });
  } catch (error) {
    console.error("Failed to fetch timeline data:", error);
    return NextResponse.json(
      { error: "Failed to fetch timeline data" },
      { status: 500 }
    );
  }
}

// Export CSV endpoint
export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const rawEmails = await prisma.emailTracking.findMany({
      where: {
        userId,
      },
      include: {
        contact: {
          select: {
            name: true,
            email: true,
          },
        },
        events: true,
        links: true,
      },
      orderBy: {
        sentAt: "desc",
      },
    });

    // Transform raw emails to match our EmailTracking type
    const emails = rawEmails.map(transformEmailData);

    // Transform data for CSV
    const csvData = emails.map((email) => {
      const openCount = email.events.filter((e) => e.type === "open").length;
      const clickCount = email.links.reduce(
        (acc, link) => acc + link.clickCount,
        0
      );
      const firstOpen = email.events.find((e) => e.type === "open")?.timestamp;
      const firstClick = email.events.find(
        (e) => e.type === "click"
      )?.timestamp;

      return {
        Subject: email.subject,
        Recipient: email.recipientEmail,
        "Contact Name": email.contact?.name || "",
        "Sent At": email.sentAt,
        "Open Count": openCount,
        "Click Count": clickCount,
        "First Open": firstOpen || "",
        "First Click": firstClick || "",
        Status: email.status,
      };
    });

    // Convert to CSV string
    const headers = Object.keys(csvData[0]);
    const csv = [
      headers.join(","),
      ...csvData.map((row) =>
        headers
          .map((header) => {
            const value = row[header as keyof typeof row];
            return typeof value === "string" && value.includes(",")
              ? `"${value}"`
              : value;
          })
          .join(",")
      ),
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=timeline.csv",
      },
    });
  } catch (error) {
    console.error("Failed to export timeline data:", error);
    return NextResponse.json(
      { error: "Failed to export timeline data" },
      { status: 500 }
    );
  }
}
