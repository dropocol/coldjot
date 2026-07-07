"use server";

import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { Prisma } from "@prisma/client";

interface Contact {
  firstName: string;
  lastName: string;
  email: string;
}

type Result<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string };

export async function addContact(
  contact: Contact
): Promise<Result<Awaited<ReturnType<typeof prisma.contact.create>>>> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      success: false,
      data: null,
      error: "Not authenticated",
    };
  }

  try {
    // A contact with this email may already exist as a soft-deleted row
    // (tombstone). If so, re-adding restores it instead of erroring.
    const existing = await prisma.contact.findUnique({
      where: {
        userId_email: {
          userId: session.user.id,
          email: contact.email,
        },
      },
      select: { id: true, deletedAt: true },
    });

    if (existing) {
      if (existing.deletedAt !== null) {
        // Restore the soft-deleted contact, refreshing its fields.
        const restored = await prisma.contact.update({
          where: { id: existing.id },
          data: {
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            name: `${contact.firstName} ${contact.lastName}`,
            deletedAt: null,
          },
        });
        return {
          success: true,
          data: restored,
          error: null,
        };
      }
      // Active duplicate → conflict.
      return {
        success: false,
        data: null,
        error: "You already have a contact with this email address",
      };
    }

    const result = await prisma.contact.create({
      data: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        name: `${contact.firstName} ${contact.lastName}`,
        userId: session.user.id,
      },
    });
    return {
      success: true,
      data: result,
      error: null,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002 is the error code for unique constraint violations
      if (error.code === "P2002") {
        return {
          success: false,
          data: null,
          error: "You already have a contact with this email address",
        };
      }
    }
    return {
      success: false,
      data: null,
      error: "Failed to add contact",
    };
  }
}

export async function importContacts(contacts: Contact[]) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Not authenticated");
  }

  const incomingEmails = contacts.map((c) => c.email);

  // Look up existing contacts (active OR soft-deleted) so a re-import of a
  // soft-deleted email restores it instead of being skipped.
  const existingContacts = await prisma.contact.findMany({
    where: {
      userId: session.user.id,
      email: {
        in: incomingEmails,
      },
    },
    select: {
      id: true,
      email: true,
      deletedAt: true,
    },
  });

  const existingActiveEmails = new Set(
    existingContacts.filter((c) => c.deletedAt === null).map((c) => c.email)
  );
  const softDeletedRows = existingContacts.filter((c) => c.deletedAt !== null);

  // Contacts to create: not already present (active or trashed).
  const newContacts = contacts.filter(
    (c) => !existingContacts.some((e) => e.email === c.email)
  );

  if (newContacts.length === 0 && softDeletedRows.length === 0) {
    throw new Error("All contacts already exist in your contact list");
  }

  // Restore soft-deleted contacts that match incoming emails.
  if (softDeletedRows.length > 0) {
    await prisma.contact.updateMany({
      where: {
        id: { in: softDeletedRows.map((r) => r.id) },
        userId: session.user.id,
        deletedAt: { not: null },
      },
      data: {
        deletedAt: null,
      },
    });
  }

  // Process in batches of 100
  const batchSize = 100;
  const results: Prisma.BatchPayload[] = [];

  for (let i = 0; i < newContacts.length; i += batchSize) {
    const batch = newContacts.slice(i, i + batchSize);
    const batchData = batch.map((contact) => ({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      name: `${contact.firstName} ${contact.lastName}`,
      userId: session.user.id,
    }));

    const result = await prisma.contact.createMany({
      data: batchData,
      skipDuplicates: true,
    });

    results.push(result);
  }

  // Active duplicates are still reported as skipped (behavior preserved).
  if (existingActiveEmails.size > 0) {
    throw new Error(
      `${existingActiveEmails.size} contacts were skipped because they already exist in your contact list`
    );
  }

  return results;
}
