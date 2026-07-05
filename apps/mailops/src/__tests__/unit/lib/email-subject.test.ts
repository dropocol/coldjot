/**
 * Unit tests for determineEmailSubject (Group M).
 *
 * Phase 7.3: now that determineEmailSubject accepts injected repos (Phase A1),
 * the subject-resolution logic is testable with in-memory fakes — no Prisma,
 * no Gmail. Covers the new-thread path (template/step/fallback/placeholder) +
 * the reply path (emailThread → emailTracking fallback, Re: prefixing, no
 * double-prefix).
 *
 * Replaces the Group M characterization test (which read Prisma directly via
 * the fake-prisma stand-in).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { determineEmailSubject } from "@/lib/email-subject";
import {
  FakeEmailThreadRepository,
  FakeTemplateRepository,
} from "@/__tests__/helpers/fakes/inbox-sync-repos.fake";
import { FakeEmailTrackingRepository } from "@/__tests__/helpers/fakes";
import { StepTypeEnum, TimingType } from "@coldjot/types";
import type { SequenceStep } from "@coldjot/types";
import type { Contact } from "@prisma/client";

let emailThread: FakeEmailThreadRepository;
let emailTracking: FakeEmailTrackingRepository;
let template: FakeTemplateRepository;

const contact = {
  id: "c1",
  firstName: "Ada",
  name: "Ada L",
  email: "ada@example.com",
} as unknown as Contact;

function makeStep(over: Partial<SequenceStep> = {}): SequenceStep {
  return {
    id: "step-1",
    sequenceId: "seq-1",
    stepType: StepTypeEnum.AUTOMATED_EMAIL,
    timing: TimingType.IMMEDIATE,
    delayAmount: null,
    delayUnit: null,
    subject: null,
    content: null,
    includeSignature: null,
    note: null,
    order: 1,
    previousStepId: null,
    replyToThread: false,
    templateId: null,
    ...over,
  } as unknown as SequenceStep;
}

beforeEach(() => {
  emailThread = new FakeEmailThreadRepository();
  emailTracking = new FakeEmailTrackingRepository();
  template = new FakeTemplateRepository();
});

describe("[Group M] determineEmailSubject — new thread", () => {
  it("uses the step subject when no template is set", async () => {
    const out = await determineEmailSubject(
      makeStep({ subject: "Hello there" }),
      undefined,
      undefined,
      undefined,
      { emailThread, emailTracking, template }
    );
    expect(out.subject).toBe("Hello there");
    expect(out.isReply).toBe(false);
  });

  it("prefers a template subject over the step subject", async () => {
    template.store.set({ id: "tmpl-1", subject: "From Template", content: null });
    const out = await determineEmailSubject(
      makeStep({ subject: "Step Subj", templateId: "tmpl-1" }),
      undefined,
      undefined,
      undefined,
      { emailThread, emailTracking, template }
    );
    expect(out.subject).toBe("From Template");
  });

  it('falls back to "No Subject" when neither step nor template provide one', async () => {
    const out = await determineEmailSubject(
      makeStep({ subject: "" }),
      undefined,
      undefined,
      undefined,
      { emailThread, emailTracking, template }
    );
    expect(out.subject).toBe("No Subject");
  });

  it("substitutes placeholders when a contact is provided", async () => {
    const out = await determineEmailSubject(
      makeStep({ subject: "Hi {{firstName}}" }),
      undefined,
      undefined,
      contact,
      { emailThread, emailTracking, template }
    );
    expect(out.subject).toBe("Hi Ada");
  });
});

describe("[Group M] determineEmailSubject — reply to thread", () => {
  it("prefixes the emailThread subject with Re: when not already prefixed", async () => {
    emailThread.seedThread({
      threadId: "thr-1",
      sequenceId: "seq-1",
      contactId: "c1",
      userId: "u1",
      firstMessageId: "m1",
      subject: "Original outreach",
      isFake: false,
      lastCheckedAt: null,
      metadata: null,
    });
    // Seed an existing tracking row so the reply branch is taken.
    emailTracking.store.set({
      id: "t1",
      threadId: "thr-1",
      subject: "Original outreach",
    } as any);

    const out = await determineEmailSubject(
      makeStep({ replyToThread: true }),
      "thr-1",
      {} as any,
      undefined,
      { emailThread, emailTracking, template }
    );
    expect(out.subject).toBe("Re: Original outreach");
    expect(out.isReply).toBe(true);
    expect(out.originalSubject).toBe("Original outreach");
  });

  it("does not double-prefix when the thread subject already starts with Re:", async () => {
    emailThread.seedThread({
      threadId: "thr-2",
      sequenceId: "seq-1",
      contactId: "c1",
      userId: "u1",
      firstMessageId: "m2",
      subject: "Re: Original outreach",
      isFake: false,
      lastCheckedAt: null,
      metadata: null,
    });
    emailTracking.store.set({
      id: "t2",
      threadId: "thr-2",
      subject: "Re: Original outreach",
    } as any);

    const out = await determineEmailSubject(
      makeStep({ replyToThread: true }),
      "thr-2",
      {} as any,
      undefined,
      { emailThread, emailTracking, template }
    );
    expect(out.subject).toBe("Re: Original outreach");
  });

  it("falls back to emailTracking when emailThread has no subject", async () => {
    emailTracking.store.set({
      id: "t3",
      threadId: "thr-3",
      subject: "From tracking",
    } as any);

    const out = await determineEmailSubject(
      makeStep({ replyToThread: true }),
      "thr-3",
      {} as any,
      undefined,
      { emailThread, emailTracking, template }
    );
    expect(out.subject).toBe("Re: From tracking");
    expect(out.isReply).toBe(true);
  });
});

describe("[Group M] determineEmailSubject — replyToThread=false is treated as new", () => {
  it("ignores the threadId and uses the step subject when replyToThread is false", async () => {
    emailTracking.store.set({ id: "t4", threadId: "thr-4", subject: "Old" } as any);
    const out = await determineEmailSubject(
      makeStep({ subject: "Fresh start", replyToThread: false }),
      "thr-4",
      undefined,
      undefined,
      { emailThread, emailTracking, template }
    );
    expect(out.subject).toBe("Fresh start");
    expect(out.isReply).toBe(false);
  });
});
