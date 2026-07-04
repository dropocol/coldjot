import { prisma } from "@coldjot/database";
import type { EmailTrackingRow } from "@coldjot/types";

/**
 * Shape of a raw EmailTracking row including the relations the timeline routes
 * query (`contact`, `events`, `links`). Inferred from the Prisma client so it
 * stays in sync with the schema without manual maintenance.
 */
export type TimelineEmail = Awaited<
  ReturnType<typeof prisma.emailTracking.findMany>
>[number] & {
  events: Array<{
    id: string;
    type: string;
    timestamp: Date;
    metadata?: unknown;
  }>;
  links: Array<{
    id: string;
    originalUrl: string;
    clickCount: number | null;
  }>;
  contact?: { name: string | null; email: string } | null;
};

/**
 * Transform a raw Prisma EmailTracking row (with relations) into the
 * EmailTracking shape consumed by the timeline UI. Shared by both the
 * sequence-scoped and global timeline routes.
 */
export function transformEmailData(email: TimelineEmail): EmailTrackingRow {
  // Calculate opens from events
  const openEvents = email.events.filter((e) => e.type === "opened");
  const openCount = openEvents.length;

  // Sort events by timestamp to get the first open
  const sortedOpenEvents = [...openEvents].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const firstOpenAt =
    sortedOpenEvents.length > 0
      ? new Date(sortedOpenEvents[sortedOpenEvents.length - 1].timestamp)
      : null;

  // Calculate clicks from events
  const clickEvents = email.events.filter((e) => e.type === "clicked");
  const sortedClickEvents = [...clickEvents].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const firstClickAt =
    sortedClickEvents.length > 0
      ? new Date(sortedClickEvents[sortedClickEvents.length - 1].timestamp)
      : null;

  // Get sent timestamp from events or fallback to email.sentAt
  const sentEvent = email.events.find((e) => e.type === "sent");
  const sentAt =
    email.sentAt || (sentEvent ? new Date(sentEvent.timestamp) : null);

  return {
    id: email.id,
    messageId: email.messageId ?? "",
    subject: email.subject ?? "No Subject",
    // previewText field is not yet on the EmailTracking model (see schema)
    previewText: undefined,
    recipientEmail: email.contact?.email ?? "unknown@email.com",
    status: email.status,
    metadata: (email.metadata as Record<string, unknown>) ?? {},
    sequenceId: email.sequenceId ?? "",
    stepId: email.stepId ?? "",
    contactId: email.contactId ?? "",
    userId: email.userId ?? "",
    openCount,
    sentAt,
    openedAt: firstOpenAt,
    clickedAt: firstClickAt,
    createdAt: email.createdAt,
    updatedAt: email.updatedAt,
    contact: email.contact
      ? {
          name: email.contact.name ?? "",
          email: email.contact.email,
        }
      : null,
    events: email.events.map((event) => ({
      id: event.id,
      type: event.type,
      timestamp: new Date(event.timestamp),
      metadata: (event.metadata as Record<string, unknown>) ?? {},
    })),
    links: email.links.map((link) => ({
      id: link.id,
      originalUrl: link.originalUrl,
      clickCount: link.clickCount ?? 0,
    })),
  };
}
