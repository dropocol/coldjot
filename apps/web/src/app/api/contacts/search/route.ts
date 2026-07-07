import { NextResponse } from "next/server";
import { prisma } from "@coldjot/database";
import { requireAuth, isAuthError } from "@/lib/auth/access";
import { logger } from "@/lib/logger";

/**
 * Free-text contact search (compose dropdowns / global search).
 *
 * Returns a bare JSON array (the frontend hook types this as Contact[]).
 *
 * Security note: this route previously had NO auth scoping — any authenticated
 * caller could match across ALL tenants. It is now scoped by userId.
 */
export async function GET(request: Request) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";

  try {
    const contacts = await prisma.contact.findMany({
      where: {
        userId, // FIX: scope by owner (pre-existing cross-tenant leak)
        deletedAt: null, // NEW: hide soft-deleted contacts
        OR: [
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(contacts);
  } catch (error) {
    logger.error("Search error:", error);
    return NextResponse.json(
      { error: "Failed to search contacts" },
      { status: 500 }
    );
  }
}
