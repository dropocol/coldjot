import { prisma } from "@coldjot/database";

/**
 * Trigger a list→sequence sync for every sequence this list is attached to.
 *
 * For each attached sequence, POSTs to the mailops sync endpoint
 * (`${MAILOPS_API_URL}/lists/:listId/sync`), which enqueues a ListSyncRecord
 * picked up by the mailops ListSyncProcessor (polls every 30s) to materialize
 * the list's active contacts into SequenceContact rows.
 *
 * Used by:
 *  - POST /api/lists/[id]/contacts        (after a contact is added to a list)
 *  - POST /api/sequences/[id]/lists       (after a list is connected to a seq)
 *
 * Returns true if all fan-outs succeeded, false if any failed (already logged).
 */
export async function triggerListSync(listId: string): Promise<boolean> {
  try {
    // Find all sequences that have this list attached.
    const sequences = await prisma.sequence.findMany({
      where: {
        lists: {
          some: {
            id: listId,
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (sequences.length === 0) {
      // Nothing attached yet — nothing to sync. Not an error.
      return true;
    }

    // Call mailops sync endpoint for each sequence.
    await Promise.all(
      sequences.map(async (sequence) => {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_MAILOPS_API_URL}/lists/${listId}/sync`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Service-Token": process.env.MAILOPS_SERVICE_TOKEN || "",
            },
            body: JSON.stringify({
              sequenceId: sequence.id,
            }),
          }
        );

        if (!response.ok) {
          throw new Error(
            `Failed to sync list ${listId} with sequence ${sequence.id}`
          );
        }

        return response.json();
      })
    );

    return true;
  } catch (error) {
    console.error("Failed to trigger list sync:", error);
    return false;
  }
}

/**
 * When contacts are removed from a list, tombstone their list-sourced
 * enrollments (sourceListId = listId) in every sequence the list is attached
 * to. Direct enrollments and other-list enrollments are untouched.
 *
 * Safe by construction: matches only rows where
 *   sourceListId = listId AND contactId IN removed AND removedAt IS NULL.
 * Idempotent: already-removed rows are excluded by the predicate.
 *
 * @returns count of enrollments tombstoned (for logging/response).
 */
export async function autoRemoveContactsFromSequences(
  listId: string,
  contactIds: string[]
): Promise<number> {
  if (contactIds.length === 0) return 0;

  // Scope to sequences this list is attached to, so we don't touch rows from a
  // sequence the list was disconnected from (stale sourceListId).
  const attachedSequences = await prisma.sequence.findMany({
    where: { lists: { some: { id: listId } } },
    select: { id: true },
  });
  if (attachedSequences.length === 0) return 0;

  const sequenceIds = attachedSequences.map((s) => s.id);

  const result = await prisma.sequenceContact.updateMany({
    where: {
      sequenceId: { in: sequenceIds },
      sourceListId: listId,
      contactId: { in: contactIds },
      removedAt: null,
    },
    data: {
      removedAt: new Date(),
      nextScheduledAt: null,
      completed: true,
    },
  });

  return result.count;
}
