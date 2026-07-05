/**
 * Unit tests for the inbox-sync pure helpers: status transitions (states.ts)
 * and the classification primitives + determineNotificationType + history-gap
 * math (classify.ts). These pin the Group C behavior at the unit level.
 */
import { describe, it, expect, vi } from "vitest";
import { NotificationType, EmailLabelEnum } from "@coldjot/types";

import { nextContactStatus } from "@/services/inbox-sync/states";
import {
  isBounceMessage,
  isExternalSender,
  isReplyMessage,
  determineNotificationType,
  calculateHistoryGap,
  isLargeHistoryGap,
} from "@/services/inbox-sync/classify";
import type { MessageDetails } from "@coldjot/types";

/**
 * Build a header pair. Typed loosely because the classify fns' `MessagePartHeader`
 * resolves to a stricter shape than the schema alias `@coldjot/types` re-exports
 * (a stale-dist quirk); these are test fixtures, so `any` avoids the noise.
 */
const h = (name: string, value: string): any => ({ name, value });

// ---- states.ts -----------------------------------------------------------

describe("nextContactStatus", () => {
  it("maps REPLY → REPLIED", () => {
    expect(nextContactStatus(NotificationType.REPLY)).toBe("replied");
  });

  it("maps BOUNCE → BOUNCED", () => {
    expect(nextContactStatus(NotificationType.BOUNCE)).toBe("bounced");
  });

  it.each([
    ["ORIGINAL_MESSAGE", NotificationType.ORIGINAL_MESSAGE],
    ["MESSAGE_ADDED", NotificationType.MESSAGE_ADDED],
  ])("returns null for %s (no transition)", (_label, type) => {
    expect(nextContactStatus(type)).toBeNull();
  });
});

// ---- classify.ts: bounce detection ---------------------------------------

describe("isBounceMessage", () => {
  it("detects a mailer-daemon bounce by From header", () => {
    expect(
      isBounceMessage([
        h("From", "Mail Delivery Subsystem <mailer-daemon@googlemail.com>"),
        h("Subject", "Delivery Status Notification (Failure)"),
      ])
    ).toBe(true);
  });

  it("detects an X-Failed-Recipients header as a bounce", () => {
    expect(
      isBounceMessage([
        h("From", "postmaster@example.com"),
        h("Subject", "undeliverable"),
        h("X-Failed-Recipients", "dest@example.com"),
      ])
    ).toBe(true);
  });

  it("returns false for a normal sender + subject", () => {
    expect(
      isBounceMessage([h("From", "user@example.com"), h("Subject", "Hello")])
    ).toBe(false);
  });
});

// ---- classify.ts: external sender ----------------------------------------

describe("isExternalSender", () => {
  it("flags a sender NOT in the internal list", () => {
    expect(isExternalSender("outsider@external.com", ["me@internal.com"])).toBe(true);
  });

  it("returns false for an internal sender", () => {
    expect(isExternalSender("me@internal.com", ["me@internal.com"])).toBe(false);
  });

  it("extracts the email from a Name <email> header", () => {
    expect(
      isExternalSender("Bob <bob@external.com>", ["me@internal.com"])
    ).toBe(true);
    expect(
      isExternalSender("Bob <me@internal.com>", ["me@internal.com"])
    ).toBe(false);
  });
});

// ---- classify.ts: reply detection ----------------------------------------

describe("isReplyMessage", () => {
  it("detects In-Reply-To", () => {
    expect(isReplyMessage([h("In-Reply-To", "<abc@example>")])).toBe(true);
  });

  it("detects References", () => {
    expect(isReplyMessage([h("References", "<abc@example>")])).toBe(true);
  });

  it("detects a 'Re:' subject", () => {
    expect(isReplyMessage([h("Subject", "Re: earlier message")])).toBe(true);
  });

  it("returns false for a plain message", () => {
    expect(isReplyMessage([h("Subject", "Hello"), h("From", "a@b.com")])).toBe(false);
  });
});

// ---- classify.ts: determineNotificationType ------------------------------

const msg = (over: Partial<MessageDetails> = {}): MessageDetails =>
  ({
    id: "m1",
    from: "outsider@external.com",
    labelIds: [EmailLabelEnum.INBOX],
    headers: [],
    isReply: false,
    ...over,
  }) as unknown as MessageDetails;

describe("determineNotificationType", () => {
  it("classifies a bounce first (highest priority)", async () => {
    const details = msg({
      from: "mailer-daemon@googlemail.com",
      headers: [h("From", "mailer-daemon@googlemail.com"), h("Subject", "Delivery Status Notification")],
    });
    const type = await determineNotificationType(details, ["me@internal.com"], "t1", async () => false);
    expect(type).toBe(NotificationType.BOUNCE);
  });

  it("classifies an external reply (In-Reply-To + external sender)", async () => {
    const details = msg({
      from: "outsider@external.com",
      headers: [h("In-Reply-To", "<orig@msg>")],
    });
    const type = await determineNotificationType(details, ["me@internal.com"], "t1", async () => true);
    expect(type).toBe(NotificationType.REPLY);
  });

  it("classifies ORIGINAL_MESSAGE when no prior original exists for the thread", async () => {
    const hasOriginal = vi.fn(async () => false);
    const details = msg({ from: "outsider@external.com", headers: [] });
    const type = await determineNotificationType(details, ["me@internal.com"], "t1", hasOriginal);
    expect(type).toBe(NotificationType.ORIGINAL_MESSAGE);
    expect(hasOriginal).toHaveBeenCalledWith("t1");
  });

  it("classifies MESSAGE_ADDED when a prior original exists and nothing else matches", async () => {
    const details = msg({ from: "outsider@external.com", headers: [] });
    const type = await determineNotificationType(details, ["me@internal.com"], "t1", async () => true);
    expect(type).toBe(NotificationType.MESSAGE_ADDED);
  });

  it("does not classify as REPLY when the sender is internal", async () => {
    const details = msg({
      from: "me@internal.com",
      headers: [h("In-Reply-To", "<orig@msg>")],
    });
    const type = await determineNotificationType(details, ["me@internal.com"], "t1", async () => true);
    expect(type).not.toBe(NotificationType.REPLY);
  });
});

// ---- classify.ts: history-gap math ---------------------------------------

describe("history-gap math", () => {
  it("computes a positive gap and uses currentHistoryId as the start", () => {
    const r = calculateHistoryGap("100", "150");
    expect(r.gap).toBe(50);
    expect(r.startHistoryId).toBe("100");
  });

  it("uses notificationHistoryId as the start when the gap is negative", () => {
    const r = calculateHistoryGap("150", "100");
    expect(r.gap).toBe(-50);
    expect(r.startHistoryId).toBe("100");
  });

  it("flags gaps over 10000 as large (absolute value)", () => {
    expect(isLargeHistoryGap(10001)).toBe(true);
    expect(isLargeHistoryGap(-10001)).toBe(true);
    expect(isLargeHistoryGap(10000)).toBe(false);
    expect(isLargeHistoryGap(9999)).toBe(false);
  });
});
