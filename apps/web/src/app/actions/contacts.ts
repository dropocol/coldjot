"use server";

import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { Prisma } from "@prisma/client";
import { tryCatch } from "@/utils/try-catch";

interface Contact {
  firstName: string;
  lastName: string;
  email: string;
}

type Result<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string };

export async function addContact(contact: Contact): Promise<Result<any>> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      success: false,
      data: null,
      error: "Not authenticated",
    };
  }

  try {
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

  // First, check for duplicates within the current user's contacts
  const existingContacts = await prisma.contact.findMany({
    where: {
      userId: session.user.id,
      email: {
        in: contacts.map((c) => c.email),
      },
    },
    select: {
      email: true,
    },
  });

  const existingEmails = new Set(existingContacts.map((c) => c.email));
  const newContacts = contacts.filter((c) => !existingEmails.has(c.email));

  if (newContacts.length === 0) {
    throw new Error("All contacts already exist in your contact list");
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

  if (existingEmails.size > 0) {
    throw new Error(
      `${existingEmails.size} contacts were skipped because they already exist in your contact list`
    );
  }

  return results;
}
