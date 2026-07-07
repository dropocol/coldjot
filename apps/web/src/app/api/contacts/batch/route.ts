import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { parseBody } from "@/lib/http/validation";
import { batchCreateContactsSchema } from "@coldjot/types/schemas";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await parseBody(req, batchCreateContactsSchema);
    if (!body.ok) return body.response;
    const { contacts } = body.data;

    const incomingEmails = contacts.map((c) => c.email);

    // Look up existing contacts by email (across both active and soft-deleted).
    // - active ones  → skip (genuine duplicate).
    // - soft-deleted → restore (un-trash on re-import), preserving id/FK links.
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
    const softDeletedRows = existingContacts.filter(
      (c) => c.deletedAt !== null
    );

    // Contacts to actually create: anything not already present (active or trashed).
    const newContacts = contacts.filter(
      (c) => !existingContacts.some((e) => e.email === c.email)
    );

    if (newContacts.length === 0 && softDeletedRows.length === 0) {
      return NextResponse.json(
        { error: "All contacts already exist in your contact list" },
        { status: 400 }
      );
    }

    // Restore soft-deleted contacts that match incoming emails (re-import = restore).
    let restoredCount = 0;
    if (softDeletedRows.length > 0) {
      const restoreResult = await prisma.contact.updateMany({
        where: {
          id: { in: softDeletedRows.map((r) => r.id) },
          userId: session.user.id,
          deletedAt: { not: null },
        },
        data: {
          deletedAt: null,
          // Refresh fields from the re-import so the row reflects the latest data.
        },
      });
      restoredCount = restoreResult.count;
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

    const imported = results.reduce((acc, r) => acc + r.count, 0);

    return NextResponse.json({
      success: true,
      imported,
      restored: restoredCount,
      skipped: existingActiveEmails.size,
    });
  } catch (error) {
    console.error("Failed to import contacts:", error);
    return NextResponse.json(
      { error: "Failed to import contacts" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const ids = searchParams.get("ids");

    if (!ids) {
      return NextResponse.json(
        { error: "No contact IDs provided" },
        { status: 400 }
      );
    }

    const contactIds = ids.split(",");

    if (contactIds.length === 0) {
      return NextResponse.json(
        { error: "No valid contact IDs provided" },
        { status: 400 }
      );
    }

    const contacts = await prisma.contact.findMany({
      where: {
        userId: session.user.id,
        deletedAt: null,
        id: {
          in: contactIds,
        },
      },
    });

    return NextResponse.json({
      contacts,
    });
  } catch (error) {
    console.error("Failed to fetch contacts:", error);
    return NextResponse.json(
      { error: "Failed to fetch contacts" },
      { status: 500 }
    );
  }
}
