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
 * Verify ALL of the given listIds belong to `userId`. Returns the set of
 * ids that are missing or belong to another tenant (empty if all valid).
 *
 * Lists have no soft-delete column, so — like sequences — an id either exists
 * and is owned, or it doesn't.
 *
 * Use this BEFORE any bulk list mutation to prevent IDOR (deleting /
 * mutating another tenant's lists). Mirrors findForeignContactIds but for
 * EmailList rows.
 */
export async function findForeignListIds(
  userId: string,
  listIds: string[]
): Promise<Set<string>> {
  if (listIds.length === 0) return new Set();
  const owned = await prisma.emailList.findMany({
    where: { id: { in: listIds }, userId },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((l) => l.id));
  return new Set(listIds.filter((id) => !ownedSet.has(id)));
}

/**
 * Verify ALL of the given templateIds belong to `userId`. Returns the set of
 * ids that are missing or belong to another tenant (empty if all valid).
 *
 * Use this BEFORE any bulk operation on template ids to prevent IDOR (operating
 * on another tenant's templates).
 */
export async function findForeignTemplateIds(
  userId: string,
  templateIds: string[]
): Promise<Set<string>> {
  if (templateIds.length === 0) return new Set();
  const owned = await prisma.template.findMany({
    where: { id: { in: templateIds }, userId },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((c) => c.id));
  return new Set(templateIds.filter((id) => !ownedSet.has(id)));
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

/**
 * Verify ALL of the given sequenceIds belong to `userId`. Returns the set of
 * ids that are missing or belong to another tenant (empty if all valid).
 *
 * Sequences have no soft-delete column, so — unlike contacts — there is no
 * deletedAt to worry about: an id either exists and is owned, or it doesn't.
 *
 * Use this BEFORE any bulk sequence mutation to prevent IDOR (deleting /
 * mutating another tenant's sequences).
 */
export async function findForeignSequenceIds(
  userId: string,
  sequenceIds: string[]
): Promise<Set<string>> {
  if (sequenceIds.length === 0) return new Set();
  const owned = await prisma.sequence.findMany({
    where: { id: { in: sequenceIds }, userId },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((s) => s.id));
  return new Set(sequenceIds.filter((id) => !ownedSet.has(id)));
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
