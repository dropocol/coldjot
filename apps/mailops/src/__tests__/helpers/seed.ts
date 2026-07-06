/**
 * Shared DB seed helpers for the repository + integration test tiers.
 *
 * Phase 7.5/7.7: every repo test needs the same FK parents (User, Sequence,
 * Contact, …). Centralizing the seed here keeps each test file focused on the
 * repo under test and makes the FK graph obvious in one place. Parents are
 * upserted by a stable id so `beforeAll` is idempotent across re-runs.
 *
 * Each test file still owns its own `beforeEach` truncate of the tables it
 * touches (children first for FKs).
 */
import { prisma } from "@coldjot/database";

export async function seedUser(id: string, email?: string) {
  return prisma.user.upsert({
    where: { id },
    update: {},
    create: { id, email: email ?? `${id}@example.com` },
  });
}

export async function seedSequence(
  id: string,
  userId: string,
  overrides: Record<string, unknown> = {}
) {
  return prisma.sequence.upsert({
    where: { id },
    update: {},
    create: { id, name: id, userId, ...overrides } as any,
  });
}

export async function seedContact(
  id: string,
  userId: string,
  email?: string
) {
  return prisma.contact.upsert({
    where: { id },
    update: {},
    create: {
      id,
      firstName: id,
      lastName: "C",
      name: `${id} C`,
      email: email ?? `${id}@example.com`,
      userId,
    },
  });
}

export async function seedSequenceStep(
  id: string,
  sequenceId: string,
  order: number,
  overrides: Record<string, unknown> = {}
) {
  return prisma.sequenceStep.create({
    data: { id, sequenceId, order, ...overrides } as any,
  });
}

export async function seedTemplate(
  id: string,
  userId: string,
  overrides: Record<string, unknown> = {}
) {
  return prisma.template.create({
    data: {
      id,
      userId,
      name: id,
      subject: "Subject",
      content: "Body",
      ...overrides,
    } as any,
  });
}

export async function seedMailbox(
  id: string,
  userId: string,
  email: string,
  overrides: Record<string, unknown> = {}
) {
  return prisma.mailbox.create({
    data: {
      id,
      userId,
      provider: "gmail",
      email,
      type: "oauth",
      providerAccountId: `acct-${id}`,
      ...overrides,
    } as any,
  });
}

export async function seedEmailList(
  id: string,
  userId: string,
  overrides: Record<string, unknown> = {}
) {
  return prisma.emailList.create({
    data: { id, name: id, userId, ...overrides } as any,
  });
}

/** Build a minimal EmailTracking row. Returns the created tracking record. */
export async function seedEmailTracking(
  hash: string,
  userId: string,
  sequenceId?: string,
  contactId?: string
) {
  return prisma.emailTracking.create({
    data: {
      hash,
      userId,
      sequenceId,
      contactId,
      metadata: { sequenceId } as any,
      status: "pending",
    },
  });
}
