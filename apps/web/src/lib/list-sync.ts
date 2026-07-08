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
