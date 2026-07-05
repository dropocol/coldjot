/**
 * Group B — tracking characterization tests.
 *
 * Pins the CURRENT behavior of the tracking surface so the Phase 4a refactor
 * (collapse the duplicate standalone fns + TrackingService class into one
 * TrackingServiceImpl) can be proven non-breaking.
 *
 * Two parallel surfaces existed before 4a; BOTH were pinned originally. After
 * 4a.3 the dead standalone `trackEmailEvent` + `updateTrackingStats` (the two
 * divergent rate-math paths, zero live callers) were deleted, and the cases
 * that pinned them (6, 6b, 7) were deleted alongside — they pinned dead code,
 * not behavior. Remaining cases:
 *   - TrackingService class: handleEmailOpen, handleLinkClick (live route path)
 *   - standalone fns still present: recordEmailOpen (case 4), createEmailTracking
 *     (cases 5a/5b). recordEmailOpen is itself dead (4a.4 deletes it + case 4);
 *     createEmailTracking moves onto the service in 4a.5.
 */
import { setupTestContext, wasCalledWith } from "@/__tests__/helpers/test-context";

const ctx = setupTestContext();

import {
  createEmailTracking,
  recordEmailOpen,
  recordLinkClick,
  TrackingService,
} from "@/lib/tracking";
import {
  EmailEventEnum,
  EmailTrackingStatusEnum,
  type EmailTrackingMetadata,
} from "@coldjot/types";

beforeEach(() => {
  ctx.reset();
});

// ---- constants --------------------------------------------------------

const SEQ_ID = "seq-1";
const CONTACT_ID = "ctc-1";
const STEP_ID = "stp-1";
const USER_ID = "usr-1";
const TRACKING_ID = "trk-1";
const HASH = "hash-aaaa";
const LINK_ID = "link-1";

function baseMetadata(): EmailTrackingMetadata {
  return {
    email: "recipient@example.com",
    userId: USER_ID,
    sequenceId: SEQ_ID,
    stepId: STEP_ID,
    contactId: CONTACT_ID,
    subject: "Hello",
  };
}

describe("[Group B] Tracking — TrackingService class", () => {
  // ---- Case 1: first open ----------------------------------------------

  it("case 1: handleEmailOpen — first open increments openCount, sets openedAt, creates OPENED event with isFirstOpen=true, bumps stats uniquely", async () => {
    ctx.fake.seed(
      "emailTracking",
      {
        id: TRACKING_ID,
        hash: HASH,
        openCount: 0,
        openedAt: null,
        status: "sent",
        sequenceId: SEQ_ID,
        contactId: CONTACT_ID,
      },
      ["hash"]
    );

    const service = new TrackingService();
    await service.handleEmailOpen(HASH);

    // emailTracking.update fired with the right shape
    expect(
      wasCalledWith(ctx, "emailTracking", "update", {
        where: { hash: HASH },
        data: {
          status: EmailTrackingStatusEnum.OPENED,
          openCount: { increment: 1 },
        },
      })
    ).toBe(true);

    // OPENED event was created
    const events = [...ctx.fake.stores.emailEvent.rows.values()];
    const opened = events.find((e) => e.type === EmailEventEnum.OPENED);
    expect(opened).toBeDefined();
    expect(opened?.metadata).toMatchObject({ isFirstOpen: true });

    // Stats bumped with isUniqueOpen: true
    expect(ctx.stats).toHaveBeenCalledWith(
      SEQ_ID,
      EmailEventEnum.OPENED,
      CONTACT_ID,
      { isUniqueOpen: true }
    );
  });

  // ---- Case 2: repeat open ---------------------------------------------

  it("case 2: handleEmailOpen — repeat open still creates an OPENED event (current behavior; Phase 4a may change)", async () => {
    // Seed a tracking row that already has openCount=1 and an OPENED event.
    ctx.fake.seed(
      "emailTracking",
      {
        id: TRACKING_ID,
        hash: HASH,
        openCount: 1,
        openedAt: new Date("2026-01-01"),
        status: "opened",
        sequenceId: SEQ_ID,
        contactId: CONTACT_ID,
      },
      ["hash"]
    );
    ctx.fake.seed("emailEvent", {
      id: "evt-old",
      trackingId: TRACKING_ID,
      type: EmailEventEnum.OPENED,
      sequenceId: SEQ_ID,
      contactId: CONTACT_ID,
    });

    const service = new TrackingService();
    await service.handleEmailOpen(HASH);

    // openCount still increments
    expect(
      wasCalledWith(ctx, "emailTracking", "update", {
        data: { openCount: { increment: 1 } },
      })
    ).toBe(true);

    // A NEW OPENED event is created (current behavior — pinned)
    const openedEvents = [...ctx.fake.stores.emailEvent.rows.values()].filter(
      (e) => e.type === EmailEventEnum.OPENED
    );
    expect(openedEvents.length).toBe(2);

    // Stats called with isUniqueOpen: false
    expect(ctx.stats).toHaveBeenCalledWith(
      SEQ_ID,
      EmailEventEnum.OPENED,
      CONTACT_ID,
      { isUniqueOpen: false }
    );
  });

  // ---- Case 3: link click happy path ----------------------------------

  it("case 3: handleLinkClick — creates LinkClick, increments TrackedLink.clickCount, sets tracking CLICKED, creates CLICKED event, returns original URL", async () => {
    ctx.fake.seed(
      "emailTracking",
      {
        id: TRACKING_ID,
        hash: HASH,
        clickedAt: null,
        status: "sent",
        sequenceId: SEQ_ID,
        contactId: CONTACT_ID,
      },
      ["hash"]
    );
    ctx.fake.seed("trackedLink", {
      id: LINK_ID,
      emailTrackingId: TRACKING_ID,
      originalUrl: "https://example.com/page",
      clickCount: 0,
    });

    const service = new TrackingService();
    const url = await service.handleLinkClick(HASH, LINK_ID);

    expect(url).toBe("https://example.com/page");

    // LinkClick record created
    const clicks = [...ctx.fake.stores.linkClick.rows.values()];
    expect(clicks.length).toBe(1);
    expect(clicks[0].trackedLinkId).toBe(LINK_ID);

    // TrackedLink.clickCount incremented
    expect(
      wasCalledWith(ctx, "trackedLink", "update", {
        data: { clickCount: { increment: 1 } },
      })
    ).toBe(true);

    // CLICKED event created
    const events = [...ctx.fake.stores.emailEvent.rows.values()];
    expect(events.some((e) => e.type === EmailEventEnum.CLICKED)).toBe(true);

    // Stats bumped
    expect(ctx.stats).toHaveBeenCalledWith(
      SEQ_ID,
      EmailEventEnum.CLICKED,
      CONTACT_ID
    );
  });
});

describe("[Group B] Tracking — standalone functions", () => {
  // ---- Case 4: recordEmailOpen (standalone) ----------------------------

  it("case 4: recordEmailOpen standalone — first open creates OPENED event + stats; mirrors TrackingService.handleEmailOpen", async () => {
    ctx.fake.seed(
      "emailTracking",
      {
        id: TRACKING_ID,
        hash: HASH,
        openCount: 0,
        openedAt: null,
        status: "sent",
        sequenceId: SEQ_ID,
        contactId: CONTACT_ID,
      },
      ["hash"]
    );

    await recordEmailOpen(HASH);

    // openCount incremented + status set to "opened" (note: lowercase string,
    // not the enum — pinned current behavior of the standalone fn)
    expect(
      wasCalledWith(ctx, "emailTracking", "update", {
        where: { hash: HASH },
        data: { status: "opened", openCount: { increment: 1 } },
      })
    ).toBe(true);

    const opened = [...ctx.fake.stores.emailEvent.rows.values()].find(
      (e) => e.type === EmailEventEnum.OPENED
    );
    expect(opened).toBeDefined();
    expect(opened?.metadata).toMatchObject({ isFirstOpen: true });

    expect(ctx.stats).toHaveBeenCalledWith(
      SEQ_ID,
      EmailEventEnum.OPENED,
      CONTACT_ID,
      { isUniqueOpen: true }
    );
  });

  // ---- Case 5: createEmailTracking happy + missing-field --------------

  it("case 5a: createEmailTracking — creates a 'pending' row with a 48-char hash + jobId stamped", async () => {
    const tracking = await createEmailTracking({
      ...baseMetadata(),
      jobId: "job-123",
    });

    expect(tracking.id).toBeDefined();
    expect(tracking.hash).toBeDefined();
    expect(tracking.hash!.length).toBe(48);

    const rows = [...ctx.fake.stores.emailTracking.rows.values()];
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].jobId).toBe("job-123");
    expect(rows[0].userId).toBe(USER_ID);
  });

  it("case 5b: createEmailTracking — throws when required fields are missing", async () => {
    await expect(
      createEmailTracking({
        email: "",
        userId: USER_ID,
        sequenceId: SEQ_ID,
        stepId: STEP_ID,
        contactId: CONTACT_ID,
      })
    ).rejects.toThrow(/Missing required metadata fields/);
  });

});
