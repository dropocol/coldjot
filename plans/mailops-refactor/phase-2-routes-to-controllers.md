# Phase 2 — Routes → Controllers (extract the HTTP/business boundary)

> **Goal:** route handlers become thin Express glue. Business logic moves into `controllers/*` which call the existing libs directly. This is **pure relocation** — no new interfaces, no behavior change.
>
> **Branch:** `refactor/mailops-phase2` (off Phase 1 branch)
> **Estimated effort:** 1 day
> **Behavior change:** zero. Every endpoint, status code, header, and response body is identical before and after.

## Why this phase exists

Today `routes/sequence/controller.ts:75 launchSequence` (and its siblings) *is* the business logic: it does its own Prisma writes (`prisma.sequence.findUnique`, `prisma.sequence.update`, `prisma.businessHours.create`), constructs the `ProcessingJob`, calls `jobManager`, and starts monitoring — all 80 lines of it. Routes should be HTTP adapters: parse request → call controller → shape response.

Moving the logic out of the route file is the cheapest possible refactor (zero behavior risk) and gives Phase 6 a clean target: when we kill the `ServiceManager` singleton, the controllers are the natural injection points for the new domain services.

## Today's route landscape (reference)

| Route file | Lines | Has business logic? |
|---|---|---|
| `routes/sequence/controller.ts` | 274 | **YES** — Prisma writes, job enqueue, monitoring |
| `routes/mailbox.ts` | 128 | **YES** — watch setup/teardown via WatchService |
| `routes/lists/index.ts` | 42 | minor — delegates to a processor |
| `routes/health/controller.ts` | 111 | minor — already a controller in shape |
| `routes/metrics/controller.ts` | 41 | already clean |
| `routes/tracking/controller.ts` | 151 | **already a controller in name only** — does HTTP-shaping concerns (pixel, UA filtering, safe-redirect) inline. Leave it; it's appropriately placed. |
| `routes/pubsub.ts` | 63 | minor — JWT verify + delegates to PubSubHandler. Leave it; the JWT verify is request-shape-specific. |

## Target structure

```
apps/mailops/src/
├── routes/                       ← thin Express glue only (≤ ~30 lines each)
│   ├── index.ts
│   ├── health/index.ts
│   ├── metrics/index.ts
│   ├── tracking/index.ts
│   ├── sequence/
│   │   ├── index.ts              ← router + the four handlers, each ≤ ~5 lines
│   │   └── validator.ts          ← stays (zod schemas)
│   ├── mailbox.ts                ← becomes thin; was 128 lines
│   └── lists/index.ts
└── controllers/                  ← business logic lives here
    ├── sequence.controller.ts    ← from routes/sequence/controller.ts (verbatim)
    ├── mailbox.controller.ts     ← from routes/mailbox.ts (extracted)
    ├── list.controller.ts        ← from routes/lists/index.ts
    ├── health.controller.ts      ← moved from routes/health/controller.ts
    └── metrics.controller.ts     ← moved from routes/metrics/controller.ts
```

## Rules for this phase (read once, apply to every step)

1. **Move-only commits.** Each controller method's body is the **byte-for-byte** body of the current route handler, with two substitutions:
   - `req.body.X` / `req.params.X` become local `const X = …` extracted at the top.
   - `res.status(N).json(...)` becomes `return { status: N, body: ... }` (a plain controller result). The route handler turns that back into an Express response.
2. **No new logic.** If you find yourself "tidying" — stop. That belongs in Phase 4.
3. **No new dependencies.** Controllers import the exact same modules the route handlers did (`prisma`, `ServiceManager`, `MonitoringService`, `rateLimitService`, `resetSequence`, etc.). Phase 3 swaps those for repositories; Phase 6 for injection. Not now.
4. **One route file per commit.** Migrate `sequence` first (the worst offender); then `mailbox`; then `lists`. `health`/`metrics`/`tracking`/`pubsub` are essentially already controllers — relocate them mechanically.

## Controller return-shape convention

To keep controllers Express-agnostic (so they're testable without supertest later), they return a plain object:

```ts
export type ControllerResult =
  | { status: 200; body: unknown }
  | { status: 201; body: unknown }
  | { status: 400; body: { error: string } }
  | { status: 404; body: { error: string } }
  | { status: 500; body: { error: string } };

// Route handler turns this into res.status().json():
function send(res: Response, result: ControllerResult) {
  return res.status(result.status).json(result.body);
}
```

For endpoints that need to do Express-specific things (set headers, send a Buffer, redirect), the controller returns a richer shape — see `tracking` below.

## Step-by-step

### Step 2.1 — Shared helpers

Create `controllers/utils.ts`:

```ts
import type { Response } from "express";

export type Ok<T> = { status: 200; body: T };
export type Created<T> = { status: 201; body: T };
export type BadRequest = { status: 400; body: { error: string } };
export type NotFound = { status: 404; body: { error: string } };
export type ServerError = { status: 500; body: { error: string } };
export type ControllerResult = Ok<unknown> | Created<unknown> | BadRequest | NotFound | ServerError;

export const ok = <T>(body: T): Ok<T> => ({ status: 200, body });
export const created = <T>(body: T): Created<T> => ({ status: 201, body });
export const badRequest = (error: string): BadRequest => ({ status: 400, body: { error } });
export const notFound = (error: string): NotFound => ({ status: 404, body: { error } });
export const serverError = (error: string): ServerError => ({ status: 500, body: { error } });

export function send(res: Response, r: ControllerResult) {
  return res.status(r.status).json(r.body);
}
```

### Step 2.2 — Migrate the sequence controller (the main one)

**Source:** `routes/sequence/controller.ts` (lines 1–275, the whole file).

**Target:** `controllers/sequence.controller.ts`.

Move each of the four handlers (`launchSequence`, `pauseSequence`, `resumeSequence`, `resetSequenceHandler`) verbatim, applying the two substitutions. Example for `launchSequence`:

```ts
// controllers/sequence.controller.ts
import { prisma } from "@coldjot/database";
import { ServiceManager } from "@/services/service-manager";
import { MonitoringService } from "@/services/monitor/service";
import { rateLimitService } from "@/services/core/rate-limit/service";
import { resetSequence } from "@/services/jobs/sequence/helper";
import { logger } from "@/lib/log";
import { ProcessingJobEnum, BusinessScheduleEnum } from "@coldjot/types";
import type { BusinessHours, ProcessingJob, BusinessScheduleType } from "@coldjot/types";
import { ok, badRequest, notFound, serverError, type ControllerResult } from "./utils";

const serviceManager = ServiceManager.getInstance();
const jobManager = serviceManager.getJobManager();
const monitoringService = new MonitoringService(serviceManager);

const DEFAULT_BUSINESS_HOURS: BusinessHours = { /* … unchanged … */ };

async function getSequenceBusinessHours(sequenceId: string, userId: string): Promise<BusinessHours> {
  /* … unchanged body of the current helper … */
}

export async function launchSequence(params: { id: string }, body: { userId: string }): Promise<ControllerResult> {
  try {
    const { id } = params;
    const { userId } = body;

    const sequence = await prisma.sequence.findUnique({ /* … unchanged … */ });
    if (!sequence) return notFound("Sequence not found");
    if (sequence.steps.length === 0) return badRequest("Sequence has no steps");
    if (sequence.contacts.length === 0) return badRequest("Sequence has no active contacts");

    const businessHours = await getSequenceBusinessHours(id, userId);

    await prisma.sequence.update({ where: { id }, data: { status: "active" } });

    const processingJob: ProcessingJob = { /* … unchanged … */ };
    const job = await jobManager.addSequenceJob(processingJob);
    await monitoringService.startMonitoring(id);

    return ok({ success: true, jobId: job.id, contactCount: sequence.contacts.length, stepCount: sequence.steps.length });
  } catch (error) {
    logger.error({ err: error }, "Error launching sequence");
    return serverError("Failed to launch sequence");
  }
}

// … same pattern for pauseSequence, resumeSequence, resetSequenceHandler …
```

**Then** `routes/sequence/index.ts` becomes thin:

```ts
import { Router } from "express";
import { z } from "zod";
import * as controller from "@/controllers/sequence.controller";
import { send } from "@/controllers/utils";
import { launchSequenceSchema } from "./validator";

const router = Router();

router.post("/:id/launch", async (req, res, next) => {
  try {
    const parsed = launchSequenceSchema.parse({ params: req.params, body: req.body });
    const result = await controller.launchSequence(parsed.params, parsed.body);
    return send(res, result);
  } catch (err) { next(err); }
});
// … pause / resume / reset follow the same shape …

export default router;
```

> **Validation note:** the existing `routes/sequence/validator.ts` already has zod schemas; reuse them. If a schema doesn't exist for one of the four endpoints, add it — this is the *one* behavior-adjacent change in this phase, and it's purely additive (a missing parse becomes a present parse).

**Verify:** hit each of the four endpoints via the web client (or curl with `X-Service-Token`). Responses byte-match.

### Step 2.3 — Migrate `routes/mailbox.ts` → `controllers/mailbox.controller.ts`

`routes/mailbox.ts` (128 lines) defines `POST /watch` + `DELETE /watch/:email`. Both call `WatchService`. Same move: extract the bodies into controller functions taking `(params, body)`, returning `ControllerResult`. Route file shrinks to ~25 lines.

### Step 2.4 — Migrate `routes/lists/index.ts` → `controllers/list.controller.ts`

42 lines. Mostly delegates. Mechanical move.

### Step 2.5 — Relocate `health` and `metrics` controllers

These already live in `routes/{health,metrics}/controller.ts`. Move them to `controllers/health.controller.ts` and `controllers/metrics.controller.ts`, and shrink the route files to mount + delegate. They already return data via `res.json` — apply the same `ControllerResult` shape.

### Step 2.6 — Leave `tracking` and `pubsub` where they are

- `routes/tracking/controller.ts` does HTTP-shaped work (transparent pixel, UA filtering, safe-redirect). It is appropriately a controller already; just **move** it from `routes/tracking/controller.ts` to `controllers/tracking.controller.ts` for consistency. The pixel Buffer + header setting stays inline — it's not abstractable without overengineering.
- `routes/pubsub.ts` does JWT verification (request-shape-specific) + delegates to `PubSubHandler`. Leave it as a route. Phase 4c will swap `PubSubHandler` for `InboxSyncService`; the route itself doesn't move.

### Step 2.7 — Update `routes/index.ts`

The aggregator `routes/index.ts` already mounts `/sequences`, `/health`, `/metrics`, `/track`. Confirm the thin route files all still mount at the same paths. No change to `server.ts`'s `app.use("/api", requireServiceToken, routes)`.

## Definition of done

- [ ] Every file under `routes/` is ≤ ~30 lines and contains only: router definition, zod parse, controller call, `send()`.
- [ ] `controllers/` exists with one file per route group.
- [ ] **HTTP contract unchanged:** every endpoint, method, path, header, status code, and JSON body is byte-identical. Spot-check by running the web app + mailops together and hitting: launch sequence, pause, resume, reset, mailbox watch setup/teardown, list sync trigger, health, metrics.
- [ ] `tsc --noEmit` clean; ESLint clean.
- [ ] Phase 0 characterization tests still pass unchanged (they don't hit HTTP, so they should be untouched).
- [ ] The `no-restricted-imports` rule from Phase 1 still warns in `controllers/` (controllers import `prisma` directly) — that's fine, Phase 3 fixes it.

## What to commit

- "phase 2.1: add controller utils"
- "phase 2.2: move sequence handlers to controller (move-only)"
- "phase 2.3: move mailbox handlers to controller"
- "phase 2.4: move list handlers to controller"
- "phase 2.5: relocate health + metrics controllers"
- "phase 2.6: relocate tracking controller"

## Risks

| Risk | Mitigation |
|---|---|
| Subtle response-shape drift (e.g., a `success: true` field forgotten) | Diff the old handler body against the new controller body line by line. The web client's existing react-query hooks will surface any drift as a runtime error in smoke-testing. |
| zod parse on an endpoint that previously didn't validate now rejects a request that used to work | This is the only non-pure part of Phase 2. If it happens, loosen the schema to accept what the old handler accepted. Log it as a finding. |
| The controllers still hold tight singleton coupling (`ServiceManager.getInstance()`) | Expected — that's Phase 6's job. This phase only relocates. |
