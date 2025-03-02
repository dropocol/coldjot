import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { sleep } from "@/utils";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) {
      return new Response("Unauthorized", { status: 401 });
    }

    const contacts = await req.json();
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json(
        { error: "Invalid contacts data" },
        { status: 400 }
      );
    }

    if (contacts.length > 1000) {
      return NextResponse.json(
        { error: "Maximum 1000 contacts allowed per batch" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "All contacts already exist in your contact list" },
        { status: 400 }
      );
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

    return NextResponse.json({
      success: true,
      imported: results.reduce((acc, r) => acc + r.count, 0),
      skipped: existingEmails.size,
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
    if (!session) {
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
