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
      const contactsAdded = await syncContactsToSequence(
        sequence.id,
        list.contacts
      );

      // Update any existing sync records for this list and sequence
      await updateSyncRecords(listId, sequence.id, contactsAdded);
    }

    logger.info({ listId }, "List sync job completed");
  } catch (error) {
    logger.error({ listId, error }, "Error in list sync job");
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

/**
 * Updates any existing sync records for this list and sequence
 */
async function updateSyncRecords(
  listId: string,
  sequenceId: string,
  contactsAdded: number
): Promise<void> {
  try {
    // Find any pending or processing sync records for this list and sequence
    const syncRecords = await prisma.listSyncRecord.findMany({
      where: {
        listId,
        sequenceId,
        status: {
          in: ["completed", "processing"],
        },
      },
    });

    if (syncRecords.length === 0) {
      logger.info({ listId, sequenceId }, "No sync records to update");
      return;
    }

    // Update each sync record
    for (const record of syncRecords) {
      await prisma.listSyncRecord.update({
        where: {
          id: record.id,
        },
        data: {
          status: "processed",
          contactsAdded,
        },
      });

      logger.info(
        { recordId: record.id, contactsAdded },
        "Updated sync record"
      );
    }
  } catch (error) {
    logger.error({ listId, sequenceId, error }, "Error updating sync records");
  }
}
