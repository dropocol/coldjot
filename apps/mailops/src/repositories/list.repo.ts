/**
 * Repository interface for the List model.
 *
 * NOTE: today's codebase has no direct `prisma.list.*` call site — the list
 * contact count is read via `listSyncRecord.findMany({ include: { list: {
 * select: { _count: { select: { contacts: true } } } } } })`. This interface
 * captures that single accessor so the call site can migrate.
 */

export interface ListRepository {
  /** Contact count for a list (used by the list-sync processor to sort). */
  contactCount(listId: string): Promise<number>;
}
