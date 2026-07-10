import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { parseQuery } from "@/lib/http/validation";
import { paginationSchema } from "@coldjot/types/schemas";

/**
 * List soft-deleted (trashed) contacts for the current user.
 *
 * Mirrors GET /api/contacts but flips the filter to `deletedAt: { not: null }`
 * and orders by `deletedAt desc` (most-recently-trashed first). Restore and
 * hard-purge are handled by the existing /api/contacts/restore and
 * /api/contacts/bulk-delete?mode=hard routes — this endpoint only lists.
 */
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const queryResult = parseQuery(searchParams, paginationSchema);
    if (!queryResult.ok) return queryResult.response;
    const { page, limit, q: query } = queryResult.data;

    const skip = (page - 1) * limit;

    // Build where clause — only trashed contacts.
    const where: Prisma.ContactWhereInput = {
      userId: session.user.id,
      deletedAt: { not: null },
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { email: { contains: query, mode: "insensitive" as const } },
              { firstName: { contains: query, mode: "insensitive" as const } },
              { lastName: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { deletedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.contact.count({ where }),
    ]);

    return NextResponse.json({
      contacts,
      total,
      page,
      limit,
      hasMore: skip + contacts.length < total,
      nextPage: skip + contacts.length < total ? page + 1 : undefined,
    });
  } catch (error) {
    console.error("Failed to fetch trashed contacts:", error);
    return NextResponse.json(
      { error: "Failed to fetch trashed contacts" },
      { status: 500 }
    );
  }
}
