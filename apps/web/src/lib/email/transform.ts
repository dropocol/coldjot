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
  // Joined by the timeline routes (not part of the Prisma default include).
  sequence?: { name: string } | null;
};

/**
 * Minimal shape we need from a SequenceStep row to label the "Step" column.
 * `EmailTracking.stepId` has no Prisma relation, so the routes resolve these
 * in a single batched query and pass them here.
 */
export type StepContext = {
  stepType: string;
  order: number;
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
    // Joined context — present when the route includes the relation.
    sequenceName: email.sequence?.name ?? null,
    stepType: null,
    stepOrder: null,
  };
}

/**
 * Attach SequenceStep context (stepType/order) onto transformed rows using a
 * pre-built `stepId -> StepContext` map. Mutates the rows in place.
 *
 * `EmailTracking.stepId` has no Prisma relation, so callers resolve the steps
 * in one batched query and hand the map here.
 */
export function enrichWithStep(
  emails: EmailTrackingRow[],
  stepMap: Map<string, StepContext>
): EmailTrackingRow[] {
  for (const email of emails) {
    const step = email.stepId ? stepMap.get(email.stepId) : undefined;
    if (step) {
      email.stepType = step.stepType;
      email.stepOrder = step.order;
    }
  }
  return emails;
}

/**
 * Keys the timeline endpoints sort by. All map to real EmailTracking columns
 * so the DB can do the ordering (clicks are aggregated from `links` and
 * therefore client-side only — not sortable server-side).
 */
export type TimelineSortKey = "sentAt" | "openCount" | "status";

/**
 * Build the Prisma `orderBy` array for timeline queries from the `sort` and
 * `order` query params. Unknown or absent params fall back to newest-first.
 */
export function buildTimelineOrderBy(
  sort: string | null | undefined,
  order: string | null | undefined
): Record<string, "asc" | "desc">[] {
  const direction: "asc" | "desc" = order === "asc" ? "asc" : "desc";
  switch (sort as TimelineSortKey) {
    case "openCount":
      return [
        { openCount: direction },
        { sentAt: direction },
        { createdAt: direction },
      ];
    case "status":
      return [
        { status: direction },
        { sentAt: direction },
        { createdAt: direction },
      ];
    case "sentAt":
      return [{ sentAt: direction }, { createdAt: direction }];
    default:
      return [{ sentAt: "desc" }, { createdAt: "desc" }];
  }
}

/**
 * Fetch SequenceStep context for a set of stepIds in a single query and return
 * a map keyed by step id. Skips the query when there are no ids to look up.
 */
export async function buildStepMap(
  stepIds: string[]
): Promise<Map<string, StepContext>> {
  const map = new Map<string, StepContext>();
  const unique = stepIds.filter((id, i, arr) => Boolean(id) && arr.indexOf(id) === i);
  if (unique.length === 0) return map;
  const steps = await prisma.sequenceStep.findMany({
    where: { id: { in: unique } },
    select: { id: true, stepType: true, order: true },
  });
  for (const step of steps) {
    map.set(step.id, { stepType: step.stepType, order: step.order });
  }
  return map;
}
