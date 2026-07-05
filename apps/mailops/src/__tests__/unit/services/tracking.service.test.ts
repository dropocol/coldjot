/**
 * Unit tests for TrackingServiceImpl. The service is constructor-injected
 * with fakes (no module mocking of @coldjot/database for the repo path); the
 * one remaining seam is `@/lib/stats` (updateSequenceStats still reads prisma)
 * and the `$transaction` in handleLinkClick, both mocked here.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock @/lib/stats so updateSequenceStats doesn't touch prisma.
const statsMock = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/lib/stats", () => ({ updateSequenceStats: statsMock }));

// Mock @coldjot/database so the $transaction in handleLinkClick runs the
// callback against a tiny in-memory prisma stand-in (linkClick.create,
// trackedLink.update, emailTracking.update).
const txMock = vi.hoisted(() => {
  const calls: any[] = [];
  const prisma = {
    linkClick: { create: vi.fn(async () => ({})) },
    trackedLink: { update: vi.fn(async () => ({})) },
    emailTracking: { update: vi.fn(async () => ({})) },
  };
  return {
    calls,
    prisma,
    $transaction: vi.fn(async (fn: (p: any) => Promise<any>) => {
      calls.push("tx");
      return fn(prisma);
    }),
  };
});
vi.mock("@coldjot/database", () => ({
  prisma: new Proxy(
    { $transaction: txMock.$transaction },
    {
      get(t, prop: string) {
        if (prop === "$transaction") return t.$transaction;
        return (txMock.prisma as any)[prop];
      },
    }
  ),
}));

import { TrackingServiceImpl } from "@/services/domain/tracking.service";
import {
  FakeEmailTrackingRepository,
  FakeEmailEventRepository,
} from "@/__tests__/helpers/fakes";
import { EmailEventEnum } from "@coldjot/types";

let emailTracking: FakeEmailTrackingRepository;
let emailEvent: FakeEmailEventRepository;
let service: TrackingServiceImpl;

beforeEach(() => {
  emailTracking = new FakeEmailTrackingRepository();
  emailEvent = new FakeEmailEventRepository();
  service = new TrackingServiceImpl(emailTracking, emailEvent);
  statsMock.mockClear();
  txMock.$transaction.mockClear();
  txMock.calls.length = 0;
  txMock.prisma.linkClick.create.mockClear();
  txMock.prisma.trackedLink.update.mockClear();
  txMock.prisma.emailTracking.update.mockClear();
});

describe("TrackingServiceImpl.createTracking", () => {
  const metadata = {
    email: "dest@example.com",
    userId: "u1",
    sequenceId: "seq1",
    stepId: "step1",
    contactId: "ct1",
  };

  it("creates a pending tracking row + returns the domain object with hash + pixel", async () => {
    const out = await service.createTracking(metadata as any);
    expect(out.wrappedLinks).toBe(true);
    expect(out.trackingId).toBeDefined();
    expect(out.hash).toBeDefined();
    expect(out.pixel).toContain("/api/track/");
    expect(emailTracking.calls.some((c) => c.method === "createPending")).toBe(true);
    // Row written at status pending.
    const row = emailTracking.store.findByIndexed("hash", out.hash);
    expect(row?.status).toBe("pending");
  });

  it("throws when required metadata fields are missing", async () => {
    await expect(
      service.createTracking({ ...metadata, userId: "" } as any)
    ).rejects.toThrow(/Missing required metadata fields/);
  });
});

describe("TrackingServiceImpl.handleEmailOpen", () => {
  const seedRow = async (events: { id: string }[] = []) => {
    const row = await emailTracking.createPending({
      hash: "h1",
      userId: "u1",
      sequenceId: "seq1",
      stepId: "step1",
      contactId: "ct1",
      metadata: {} as any,
    });
    for (const e of events) emailTracking.events.set({ ...e, trackingId: row.id, type: "OPENED" as any });
    return row;
  };

  it("first open: recordOpen + OPENED event + stats with isUniqueOpen:true", async () => {
    await seedRow([]); // no prior OPENED events
    await service.handleEmailOpen("h1");
    expect(emailTracking.calls.some((c) => c.method === "recordOpen")).toBe(true);
    expect(statsMock).toHaveBeenCalledWith("seq1", EmailEventEnum.OPENED, "ct1", {
      isUniqueOpen: true,
    });
  });

  it("repeat open: still recordOpen + stats with isUniqueOpen:false", async () => {
    const row = await seedRow([]);
    emailTracking.events.set({ id: "e1", trackingId: row.id, type: "OPENED" as any });
    await service.handleEmailOpen("h1");
    expect(statsMock).toHaveBeenCalledWith("seq1", EmailEventEnum.OPENED, "ct1", {
      isUniqueOpen: false,
    });
  });

  it("unknown hash: no-op (no recordOpen, no stats)", async () => {
    await service.handleEmailOpen("missing");
    expect(emailTracking.calls.some((c) => c.method === "recordOpen")).toBe(false);
    expect(statsMock).not.toHaveBeenCalled();
  });
});

describe("TrackingServiceImpl.handleLinkClick", () => {
  it("happy path: $transaction writes click + trackedLink + emailTracking, stats updated, returns URL", async () => {
    const row = await emailTracking.createPending({
      hash: "h1",
      userId: "u1",
      sequenceId: "seq1",
      stepId: "step1",
      contactId: "ct1",
      metadata: {} as any,
    });
    // findWithLink returns the link shape with an originalUrl.
    emailTracking.store.index("hash", "h1", row.id);

    // Spy findWithLink to return a link with originalUrl.
    const orig = emailTracking.findWithLink.bind(emailTracking);
    emailTracking.findWithLink = async (hash, linkId) => {
      const base = await orig(hash, linkId);
      if (!base) return null;
      return { ...base, links: [{ id: linkId, originalUrl: "https://dest.example/clicked" }] };
    };

    const url = await service.handleLinkClick("h1", "link-1");
    expect(url).toBe("https://dest.example/clicked");
    expect(txMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.prisma.linkClick.create).toHaveBeenCalledTimes(1);
    expect(txMock.prisma.trackedLink.update).toHaveBeenCalledTimes(1);
    expect(txMock.prisma.emailTracking.update).toHaveBeenCalledTimes(1);
    expect(statsMock).toHaveBeenCalledWith("seq1", EmailEventEnum.CLICKED, "ct1");
  });

  it("unknown hash throws 'Invalid tracking data'", async () => {
    await expect(service.handleLinkClick("missing", "lid")).rejects.toThrow(
      /Invalid tracking data/
    );
  });
});

describe("TrackingServiceImpl.trackEmailEvent", () => {
  it("creates the event + sets tracking status + bumps stats", async () => {
    const row = await emailTracking.createPending({
      hash: "h1",
      userId: "u1",
      sequenceId: "seq1",
      stepId: "step1",
      contactId: "ct1",
      metadata: {} as any,
    });
    await service.trackEmailEvent({ trackingId: row.id, eventType: EmailEventEnum.SPAM });
    expect(emailEvent.calls.some((c) => c.method === "create")).toBe(true);
    expect(emailTracking.calls.some((c) => c.method === "setStatus")).toBe(true);
    expect(statsMock).toHaveBeenCalledWith("seq1", EmailEventEnum.SPAM, "ct1");
  });

  it("throws when the tracking row is missing", async () => {
    await expect(
      service.trackEmailEvent({ trackingId: "nope", eventType: EmailEventEnum.SPAM })
    ).rejects.toThrow(/Email tracking record not found/);
  });
});
