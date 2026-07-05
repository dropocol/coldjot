import { logger } from "@/lib/log";
import { PrismaSequenceContactRepository } from "@/repositories/prisma/prisma-sequence-contact.repo";
import { PrismaListRepository } from "@/repositories/prisma/prisma-list.repo";
import { PrismaListSyncRecordRepository } from "@/repositories/prisma/prisma-list-sync-record.repo";

const sequenceContactRepo = new PrismaSequenceContactRepository();
const listRepo = new PrismaListRepository();
const listSyncRecordRepo = new PrismaListSyncRecordRepository();

const BATCH_SIZE = 1000; // Process contacts in chunks of 1000

/**
 * Syncs contacts from a list to all sequences that have that list attached
 */
export async function syncListToSequences(listId: string) {
  try {
    logger.info({ listId }, "Starting list sync job");

    // Get the list with its sequences first (without contacts)
    const list = await listRepo.findWithSequences(listId);

    if (!list) {
      logger.warn({ listId }, "List not found");
      return;
    }

    if (list.sequences.length === 0) {
      logger.info({ listId }, "No sequences attached to this list");
      return;
    }

    // Get total contact count
    const totalContactCount = await listRepo.contactCount(listId);
    logger.info(
      {
        listId,
        totalContacts: totalContactCount,
        sequenceCount: list.sequences.length,
      },
      "Starting batch sync process"
    );

    // Process each sequence
    for (const sequence of list.sequences) {
      // Update sync record status to processing
      await updateSyncRecordStatus(listId, sequence.id, "processing");

      try {
        let processedCount = 0;
        let totalAdded = 0;

        // Process contacts in batches
        while (processedCount < totalContactCount) {
          const contacts = await listRepo.findContactsPage(
            listId,
            BATCH_SIZE,
            processedCount
          );

          if (!contacts.length) break;

          const added = await syncContactsToSequence(
            sequence.id,
            contacts
          );

          totalAdded += added;
          processedCount += contacts.length;

          logger.info(
            {
              listId,
              sequenceId: sequence.id,
              progress: `${processedCount}/${totalContactCount}`,
              batchAdded: added,
            },
            "Batch processed"
          );
        }

        // Update sync record with success status and contacts added
        await updateSyncRecordStatus(
          listId,
          sequence.id,
          "completed",
          totalAdded
        );

        logger.info(
          {
            listId,
            sequenceId: sequence.id,
            totalAdded,
          },
          "Sequence sync completed"
        );
      } catch (error) {
        await updateSyncRecordStatus(
          listId,
          sequence.id,
          "failed",
          0,
          error instanceof Error ? error.message : "Unknown error"
        );
        logger.error(
          { listId, sequenceId: sequence.id, error },
          "Error syncing contacts to sequence"
        );
      }
    }

    logger.info({ listId }, "List sync job completed");
  } catch (error) {
    logger.error({ listId, error }, "Error in list sync job");
  }
}

/**
 * Updates the status of a sync record
 */
async function updateSyncRecordStatus(
  listId: string,
  sequenceId: string,
  status: string,
  contactsAdded: number = 0,
  error: string | null = null
): Promise<void> {
  try {
    await listSyncRecordRepo.updateStatusByListSequence(
      listId,
      sequenceId,
      { status, contactsAdded, error }
    );
  } catch (err) {
    logger.error(
      { listId, sequenceId, error: err },
      "Error updating sync record status"
    );
  }
}

/**
 * Syncs contacts to a sequence, skipping those that are already in the sequence
 * Returns the number of contacts added
 */
async function syncContactsToSequence(
  sequenceId: string,
  contacts: any[]
): Promise<number> {
  try {
    // Get existing sequence contacts efficiently using a Set
    const existingContactIds = new Set(
      await sequenceContactRepo.listContactIdsInSequence(sequenceId)
    );

    // Filter out contacts that are already in the sequence
    const newContacts = contacts.filter(
      (contact) => !existingContactIds.has(contact.id)
    );

    if (newContacts.length === 0) {
      logger.info({ sequenceId }, "No new contacts to add to sequence");
      return 0;
    }

    // Process in smaller chunks for better memory management
    const chunkSize = 100;
    for (let i = 0; i < newContacts.length; i += chunkSize) {
      const chunk = newContacts.slice(i, i + chunkSize);
      await sequenceContactRepo.addContactsToSequence(
        sequenceId,
        chunk.map((c) => c.id)
      );
    }

    logger.info(
      { sequenceId, addedCount: newContacts.length },
      "Added contacts to sequence"
    );

    return newContacts.length;
  } catch (error) {
    logger.error({ sequenceId, error }, "Error syncing contacts to sequence");
    return 0;
  }
}
