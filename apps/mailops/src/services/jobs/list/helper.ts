import { prisma } from "@coldjot/database";
import { logger } from "@/lib/log";

/**
 * Syncs contacts from a list to all sequences that have that list attached
 */
export async function syncListToSequences(listId: string) {
  try {
    logger.info({ listId }, "Starting list sync job");

    // Get the list with its contacts
    const list = await prisma.emailList.findUnique({
      where: {
        id: listId,
      },
      include: {
        contacts: true,
        sequences: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!list) {
      logger.warn({ listId }, "List not found");
      return;
    }

    if (list.sequences.length === 0) {
      logger.info({ listId }, "No sequences attached to this list");
      return;
    }

    logger.info(
      {
        listId,
        contactCount: list.contacts.length,
        sequenceCount: list.sequences.length,
      },
      "Syncing contacts from list to sequences"
    );

    // Process each sequence
    for (const sequence of list.sequences) {
      // Update sync record status to processing
      await updateSyncRecordStatus(listId, sequence.id, "processing");

      try {
        const contactsAdded = await syncContactsToSequence(
          sequence.id,
          list.contacts
        );

        // Update sync record with success status and contacts added
        await updateSyncRecordStatus(
          listId,
          sequence.id,
          "completed",
          contactsAdded
        );
      } catch (error) {
        // Update sync record with error status
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
    await prisma.listSyncRecord.updateMany({
      where: {
        listId,
        sequenceId,
        status: {
          in: ["pending", "processing"],
        },
      },
      data: {
        status,
        contactsAdded,
        error,
        updatedAt: new Date(),
      },
    });
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
    // Get existing sequence contacts
    const existingContacts = await prisma.sequenceContact.findMany({
      where: {
        sequenceId,
      },
      select: {
        contactId: true,
      },
    });

    const existingContactIds = existingContacts.map(
      (contact) => contact.contactId
    );

    // Filter out contacts that are already in the sequence
    const newContacts = contacts.filter(
      (contact) => !existingContactIds.includes(contact.id)
    );

    if (newContacts.length === 0) {
      logger.info({ sequenceId }, "No new contacts to add to sequence");
      return 0;
    }

    // Add new contacts to the sequence
    await prisma.sequenceContact.createMany({
      data: newContacts.map((contact) => ({
        sequenceId,
        contactId: contact.id,
        status: "not_sent",
        currentStep: 0,
      })),
      skipDuplicates: true,
    });

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
