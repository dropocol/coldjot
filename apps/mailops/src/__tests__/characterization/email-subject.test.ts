/**
 * Group M — email-subject characterization tests.
 *
 * Pins the CURRENT behavior of lib/email-subject.ts → `determineEmailSubject`.
 * This module decides the outbound subject for a step: new-thread (template →
 * step → "No Subject") vs. reply-to-thread (emailThread → emailTracking →
 * Gmail API fallback, with `Re:` prefixing). Placeholder substitution is
 * applied via `replacePlaceholders` when a contact is supplied.
 *
 * Source: lib/email-subject.ts (lines 9–311).
 */
import { setupTestContext, wasCalledWith } from "@/__tests__/helpers/test-context";

// Mock the gmail helper used for the API-fallback branch. test-context mocks
// @/lib/google and @/lib/google/gmail/helper, but NOT @/lib/google/gmail
// (the bare module email-subject imports getGmailSubject from).
const gmailSubjectMock = vi.hoisted(() => ({
  getGmailSubject: vi.fn(async () => "Gmail Thread Subject" as string | null),
}));
vi.mock("@/lib/google/gmail", () => ({
  getGmailSubject: gmailSubjectMock.getGmailSubject,
}));

const ctx = setupTestContext();

import { determineEmailSubject } from "@/lib/email-subject";
import type { SequenceStep } from "@coldjot/types";
import type { Contact } from "@prisma/client";

beforeEach(() => {
  ctx.reset();
  gmailSubjectMock.getGmailSubject.mockReset();
  gmailSubjectMock.getGmailSubject.mockResolvedValue("Gmail Thread Subject");
});

const SEQ_STEP_ID = "step-1";
const TEMPLATE_ID = "tpl-1";
const THREAD_ID = "thr-1";

function makeStep(over: Partial<SequenceStep> = {}): SequenceStep {
  return {
    id: SEQ_STEP_ID,
    subject: "Hello there",
    order: 1,
    replyToThread: false,
    templateId: null,
    ...over,
  } as SequenceStep;
}

function makeContact(over: Partial<Contact> = {}): Contact {
  return {
    id: "c1",
    firstName: "Ada",
    lastName: "Lovelace",
    name: "Ada Lovelace",
    email: "ada@example.com",
    ...over,
  } as Contact;
}

// ------------------------------------------------------------------------
// New-thread path
// ------------------------------------------------------------------------

describe("[Group M] determineEmailSubject — new thread", () => {
  it("uses step.subject when no threadId and no templateId", async () => {
    const out = await determineEmailSubject(makeStep(), undefined, undefined, makeContact());
    expect(out).toEqual({
      subject: "Hello there",
      isReply: false,
      originalSubject: "Hello there",
    });
  });

  it("prefers template.subject over step.subject on a new thread", async () => {
    ctx.fake.seed("template", { id: TEMPLATE_ID, subject: "Template Subj" });
    const out = await determineEmailSubject(
      makeStep({ templateId: TEMPLATE_ID, subject: "Step Subj" }),
      undefined,
      undefined,
      makeContact()
    );
    expect(out.subject).toBe("Template Subj");
    expect(out.isReply).toBe(false);
    expect(wasCalledWith(ctx, "template", "findUnique", { where: { id: TEMPLATE_ID } })).toBe(true);
  });

  it("falls back to 'No Subject' when step has no subject and no template", async () => {
    const out = await determineEmailSubject(
      makeStep({ subject: null as any, templateId: null }),
      undefined,
      undefined,
      undefined
    );
    expect(out.subject).toBe("No Subject");
    expect(out.isReply).toBe(false);
  });

  it("substitutes placeholders in the subject when contact provided", async () => {
    const out = await determineEmailSubject(
      makeStep({ subject: "Hi {{firstName}}" }),
      undefined,
      undefined,
      makeContact({ firstName: "Grace" })
    );
    expect(out.subject).toBe("Hi Grace");
  });
});

// ------------------------------------------------------------------------
// Reply path
// ------------------------------------------------------------------------

describe("[Group M] determineEmailSubject — reply to thread", () => {
  it("uses emailThread.subject and prefixes 'Re:' when replyToThread + existing emails", async () => {
    // replyToThread true + at least one existing emailTracking → not a new thread
    ctx.fake.seed(
      "emailTracking",
      { id: "et-1", threadId: THREAD_ID, subject: "Original subject" },
      ["threadId"]
    );
    ctx.fake.seed("emailThread", { id: "et-1", threadId: THREAD_ID, subject: "Original subject" }, ["threadId"]);

    const out = await determineEmailSubject(
      makeStep({ replyToThread: true }),
      THREAD_ID,
      undefined,
      makeContact()
    );
    expect(out).toEqual({
      subject: "Re: Original subject",
      isReply: true,
      originalSubject: "Original subject",
    });
  });

  it("does NOT double-prefix when thread subject already starts with 'Re:'", async () => {
    ctx.fake.seed(
      "emailTracking",
      { id: "et-1", threadId: THREAD_ID, subject: "Re: already" },
      ["threadId"]
    );
    ctx.fake.seed("emailThread", { id: "et-1", threadId: THREAD_ID, subject: "Re: already" }, ["threadId"]);

    const out = await determineEmailSubject(
      makeStep({ replyToThread: true }),
      THREAD_ID,
      undefined,
      undefined
    );
    expect(out.subject).toBe("Re: already");
    expect(out.isReply).toBe(true);
  });

  it("falls back to emailTracking row when emailThread has no subject", async () => {
    // 1 existing email → not new thread; emailThread row exists but subject null
    ctx.fake.seed(
      "emailTracking",
      { id: "et-1", threadId: THREAD_ID, subject: "From tracking row", createdAt: new Date(1) },
      ["threadId"]
    );
    ctx.fake.seed("emailThread", { id: "et-1", threadId: THREAD_ID, subject: null }, ["threadId"]);

    const out = await determineEmailSubject(
      makeStep({ replyToThread: true }),
      THREAD_ID,
      undefined,
      undefined
    );
    expect(out.subject).toBe("Re: From tracking row");
    expect(out.isReply).toBe(true);
    expect(out.originalSubject).toBe("From tracking row");
  });

  it("swallows the 'Gmail client required' throw and falls back to step subject", async () => {
    // existing email → reply path; no emailThread, no emailTracking row,
    // no gmail client → inner throw 'Gmail client required...' is caught by
    // the inner catch and the function returns a fallback (isReply:false).
    // This is the CURRENT behavior — the throw never escapes.
    ctx.fake.seed(
      "emailTracking",
      { id: "et-1", threadId: THREAD_ID, subject: "" },
      ["threadId"]
    );
    const out = await determineEmailSubject(
      makeStep({ replyToThread: true, subject: "Step fallback" }),
      THREAD_ID,
      undefined,
      undefined
    );
    expect(out).toEqual({ subject: "Step fallback", isReply: false });
  });

  it("uses Gmail API subject + 'Re:' prefix when no local data exists", async () => {
    ctx.fake.seed(
      "emailTracking",
      { id: "et-1", threadId: THREAD_ID, subject: "" },
      ["threadId"]
    );
    gmailSubjectMock.getGmailSubject.mockResolvedValue("From Gmail API");
    const fakeGmail = {} as any; // presence is enough; getGmailSubject is mocked
    const out = await determineEmailSubject(
      makeStep({ replyToThread: true }),
      THREAD_ID,
      fakeGmail,
      undefined
    );
    expect(out.subject).toBe("Re: From Gmail API");
    expect(out.isReply).toBe(true);
    expect(gmailSubjectMock.getGmailSubject).toHaveBeenCalledWith(fakeGmail, THREAD_ID);
  });

  it("treats replyToThread=false as a NEW thread even when threadId is present", async () => {
    // replyToThread false → isNewThread true regardless of existing emails
    ctx.fake.seed(
      "emailTracking",
      { id: "et-1", threadId: THREAD_ID, subject: "exists" },
      ["threadId"]
    );
    const out = await determineEmailSubject(
      makeStep({ replyToThread: false, subject: "Brand new" }),
      THREAD_ID,
      undefined,
      undefined
    );
    expect(out.subject).toBe("Brand new");
    expect(out.isReply).toBe(false);
  });
});
