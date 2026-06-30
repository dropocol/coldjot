import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { Prisma } from "@prisma/client";

/**
 * Require an authenticated session. Returns either the caller's userId or a
 * 401 NextResponse. Use `isAuthError` to narrow.
 *
 * Every authenticated web route should start with:
 *   const authResult = await requireAuth();
 *   if (isAuthError(authResult)) return authResult;
 *   const { userId } = authResult;
 */
export async function requireAuth(): Promise<
  { userId: string } | NextResponse
> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { userId };
}

/** Type guard: did requireAuth() return an error response or a userId? */
export function isAuthError(
  r: { userId: string } | NextResponse
): r is NextResponse {
  return r instanceof NextResponse;
}

/**
 * Verify ALL of the given contactIds belong to `userId`. Returns the set of
 * ids that are missing or belong to another tenant (empty if all valid).
 *
 * Use this BEFORE any Prisma `connect`/`set` that references contact ids to
 * prevent IDOR (attaching another tenant's contacts to your own list/sequence).
 */
export async function findForeignContactIds(
  userId: string,
  contactIds: string[]
): Promise<Set<string>> {
  if (contactIds.length === 0) return new Set();
  const owned = await prisma.contact.findMany({
    where: { id: { in: contactIds }, userId },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((c) => c.id));
  return new Set(contactIds.filter((id) => !ownedSet.has(id)));
}

/**
 * Verify a single contact belongs to `userId`. Returns the contact (with the
 * fields you select) or null. Doubles as ownership check + existence check.
 */
export async function findOwnedContact<T extends Prisma.ContactSelect>(
  userId: string,
  contactId: string,
  select?: T
) {
  return prisma.contact.findFirst({
    where: { id: contactId, userId },
    select,
  });
}

/** True if the error is Prisma's "record not found" (code P2025). */
export function isNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

/** Standard 404 response for not-found resources. */
export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

/** Standard 403 response for forbidden actions. */
export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}
