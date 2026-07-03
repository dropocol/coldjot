import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";
import { updateEmailSubject } from "@/lib/google/gmail";
import { transformEmailData } from "@/lib/email/transform";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "20");
    const status = searchParams.get("status");
    const date = searchParams.get("date");

    const skip = (page - 1) * limit;
    const { id } = await params;

    // Build where clause
    const where = {
      sequenceId: id,
      status: status && status !== "all" ? status : undefined,
      sentAt: date
        ? {
            gte: new Date(date),
            lt: new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000),
          }
        : undefined,
    };

    // Get sequence mailbox for access token
    const sequenceMailbox = await prisma.sequenceMailbox.findUnique({
      where: { sequenceId: id },
      include: {
        mailbox: true,
      },
    });

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

    // Update missing subjects if we have access to Gmail
    if (sequenceMailbox?.mailbox?.access_token) {
      await Promise.all(
        rawEmails
          .filter((email) => !email.subject && email.threadId)
          .map((email) =>
            updateEmailSubject(sequenceMailbox.mailbox.access_token!, email.id)
          )
      );

      // Refetch emails to get updated subjects
      const updatedEmails = await prisma.emailTracking.findMany({
        where: {
          id: {
            in: rawEmails.map((email) => email.id),
          },
        },
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
      });

      // Transform and sort updated emails
      const emails = updatedEmails.map(transformEmailData).sort((a, b) => {
        const dateA = a.sentAt ? new Date(a.sentAt).getTime() : 0;
        const dateB = b.sentAt ? new Date(b.sentAt).getTime() : 0;
        return dateB - dateA;
      });

      return NextResponse.json({
        emails,
        total,
        page,
        limit,
        hasMore: skip + emails.length < total,
        nextPage: skip + emails.length < total ? page + 1 : undefined,
      });
    }

    // If no Gmail access, transform and sort the raw emails
    const emails = rawEmails.map(transformEmailData).sort((a, b) => {
      const dateA = a.sentAt ? new Date(a.sentAt).getTime() : 0;
      const dateB = b.sentAt ? new Date(b.sentAt).getTime() : 0;
      return dateB - dateA;
    });

    return NextResponse.json({
      emails,
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
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rawEmails = await prisma.emailTracking.findMany({
      where: {
        sequenceId: id,
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
