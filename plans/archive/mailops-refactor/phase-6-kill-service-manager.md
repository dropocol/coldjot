# Phase 6 — Kill the `ServiceManager` Singleton

> **Goal:** replace the `ServiceManager.getInstance()` god-object with the plain composition root from Phase 1. Dependencies are passed via constructor; nothing reaches across the codebase for a singleton.
>
> **Sub-branch:** `refactor/mailops/phase-6-singleton` (off `refactor/mailops` after Phase 5 merges)
> **Estimated effort:** 2 days
> **Behavior change:** zero. The same instances are constructed; they're just wired in one place and passed in, instead of being reached for globally.

## Why this phase exists

After Phases 1–5, every domain class already takes its dependencies via constructor — the migration is done at the *definition* site. But the *call sites* still do `ServiceManager.getInstance()` in three places:

1. `routes/sequence/controller.ts:16` — `const serviceManager = ServiceManager.getInstance(); const jobManager = serviceManager.getJobManager();`
2. `services/jobs/email/processor.ts:34` — `private serviceManager = ServiceManager.getInstance();`
3. `server.ts` — `const serviceManager = createServiceManager();` then `serviceManager.initialize()` + `mountBullBoard(serviceManager)`.

Plus `service-manager.ts` itself (297 lines) still owns Redis, memory monitor, rate-limit, PubSub, watch cleanup, every queue, every DLQ, every processor. It's the god-object that survived Phase 4 because it's wiring, not domain logic — but it's still a singleton, and that blocks testability.

This phase makes `composition-root.ts` the *only* place that knows about concrete instances.

## Target

- `composition-root.ts` is the single source of truth. It builds the `App` graph (repositories, adapters, domain services) AND the infrastructure (Redis, queues, processors, PubSub, watch cleanup, memory monitor).
- `server.ts` calls `createApp()` once, then `app.initialize()` and `mountBullBoard(app)`.
- Routes and processors receive their dependencies via constructor (passed from `app`), not via `getInstance()`.
- `service-manager.ts` is deleted (or reduced to a thin type re-export if Bull-Board's API needs it).
- `grep -rn "getInstance" apps/mailops/src` returns matches only inside the truly-global infra singletons (Redis connection, MemoryMonitor) if you choose to keep them as singletons — or zero if you inject those too.

## Step-by-step

### Step 6.1 — Move infrastructure ownership into the composition root

`composition-root.ts` currently builds only repos + domain services. Extend it to also own:

```ts
export function createApp(): App {
  // Infrastructure
  const redis = RedisConnection.getInstance();        // keep as singleton for now — it's a true process-wide resource
  const memoryMonitor = MemoryMonitor.getInstance();
  const rateLimit = RateLimitService.getInstance();
  const pubsub = PubSubService.getInstance();
  const watchCleanup = new WatchCleanupService();

  // Repositories & domain services (from Phases 1–4)
  const emailTracking = new PrismaEmailTrackingRepository();
  // … all repos …
  const sendEmail = new SendEmailServiceImpl(/* transport, repos */);
  const tracking = new TrackingServiceImpl(/* repos */);
  const inboxSync = new InboxSyncServiceImpl(/* repos, inboxSource */);
  const launchSequence = new LaunchSequenceServiceImpl(/* repos, jobManager, monitoring */);
  const runSchedule = new RunScheduleServiceImpl(/* repos, jobManager */);

  // Queues + processors (the part ServiceManager owned)
  const queues = createQueues(redis);                 // returns Map<QueueName, Queue>
  const dlQueues = createDlQueues(redis);
  const jobManager = createJobManager(queues);
  const processors = createProcessors(queues, { sendEmail, tracking, inboxSync, runSchedule, /* … */ });

  const app: App = { redis, memoryMonitor, rateLimit, pubsub, watchCleanup, queues, dlQueues, jobManager, processors, /* repos + services */ };
  return app;
}

export async function initializeApp(app: App): Promise<void> {
  await app.memoryMonitor.startMonitoring();
  await app.pubsub.initialize();
  await app.pubsub.startListening((msg) => app.inboxSync.handleNotification(msg));
  await app.watchCleanup.start();
  // Processors start their BullMQ workers on construction; nothing extra here.
}
```

The body of `createQueues` / `createDlQueues` / `createProcessors` is moved verbatim from `service-manager.ts:104-209`. Each becomes a free function in `composition-root.ts` (or a sibling file like `composition/queues.ts` if the root gets too long).

**Verify:** `wiring.test.ts` (Phase 1) still passes after extending its assertions to cover queues/processors.

### Step 6.2 — Make processors take dependencies via constructor

`EmailProcessor` today:
```ts
export class EmailProcessor extends BaseProcessor<EmailJob> {
  private serviceManager = ServiceManager.getInstance();
  private jobManager = this.serviceManager.getJobManager();
  private scheduleGenerator: ScheduleGenerator;
  constructor(queue: Queue) {
    super(queue, QUEUE_NAMES.EMAIL, getWorkerOptions(QUEUE_NAMES.EMAIL));
    this.scheduleGenerator = scheduleGenerator;
  }
}
```

After:
```ts
export class EmailProcessor extends BaseProcessor<EmailJob> {
  constructor(
    queue: Queue,
    private readonly jobManager: JobManager,
    private readonly sendEmail: SendEmailService,
    private readonly tracking: TrackingService,
    private readonly emailTracking: EmailTrackingRepository,
    private readonly sequenceStep: SequenceStepRepository,
    private readonly contact: ContactRepository,
    private readonly mailbox: MailboxRepository,
    private readonly template: TemplateRepository,
    private readonly sequence: SequenceRepository,
    private readonly emailThread: EmailThreadRepository,
    private readonly sequenceContact: SequenceContactRepository,
    private readonly rateLimit: RateLimitService,
    private readonly schedule: ScheduleGenerator,
  ) {
    super(queue, QUEUE_NAMES.EMAIL, getWorkerOptions(QUEUE_NAMES.EMAIL));
  }
}
```

That's a lot of constructor params — but it's *honest* about what this class touches, and the composition root handles all of it. The class body shrinks (no more private singletons).

Apply the same pattern to: `ScheduleProcessor`, `SequenceProcessor`, `ContactProcessor`, `ListSyncProcessor`. Each gets exactly the repos/services it actually uses.

**`createProcessors`** in the composition root wires each:
```ts
function createProcessors(queues, deps) {
  return {
    [QUEUE_NAMES.EMAIL]: new EmailProcessor(queues.email, deps.jobManager, deps.sendEmail, deps.tracking, /* … */),
    [QUEUE_NAMES.SEQUENCE]: new SequenceProcessor(queues.sequence, /* … */),
    // …
  };
}
```

**Verify:** characterization tests for EmailProcessor + ScheduleProcessor pass. They were already injecting fakes after Phase 3; now the constructor signature is explicit.

### Step 6.3 — Make controllers take dependencies via constructor

`controllers/sequence.controller.ts` today has module-level singletons:
```ts
const serviceManager = ServiceManager.getInstance();
const jobManager = serviceManager.getJobManager();
const monitoringService = new MonitoringService(serviceManager);
```

After Phase 6, the controller becomes a class or a set of factory functions:
```ts
export function createSequenceController(deps: {
  jobManager: JobManager;
  monitoring: MonitoringService;
  sequence: SequenceRepository;
  businessHours: BusinessHoursRepository;
  rateLimit: RateLimitService;
}) {
  return {
    async launch(params, body): Promise<ControllerResult> { /* uses deps.* */ },
    async pause(params, body): Promise<ControllerResult> { /* … */ },
    async resume(params, body): Promise<ControllerResult> { /* … */ },
    async reset(params, body): Promise<ControllerResult> { /* … */ },
  };
}
```

`composition-root.ts` constructs it: `const sequenceController = createSequenceController({ jobManager, monitoring, sequence, businessHours, rateLimit });`

The route file (`routes/sequence/index.ts`) needs the controller instance. Two ways:
- **(a) Module-level singleton** — set via a stopgap setter (like Phase 3's tracking stopgap). Quick but ugly.
- **(b) App-level wiring** — `server.ts` passes `app.sequenceController` into a `makeRoutes(app)` factory that builds the router with closures.

**Pick (b).** It's the clean version and not much more code:
```ts
// routes/index.ts
export function makeRouter(app: App): Router {
  const router = Router();
  router.use("/sequences", makeSequenceRouter(app.sequenceController));
  router.use("/health", makeHealthRouter(app.healthController));
  // …
  return router;
}
// server.ts
const app = createApp();
await initializeApp(app);
app.use("/api", requireServiceToken, makeRouter(app));
```

Apply to every controller. Each route file becomes a `makeXRouter(controller)` factory.

### Step 6.4 — Update `server.ts`

```ts
import { createApp, initializeApp } from "@/composition-root";
import { makeRouter } from "@/routes";
import { mountBullBoard } from "@/lib/bull-board";
// … cors, pino-http, auth middleware unchanged …

const app = createApp();
const expressApp = express();

initializeApp(app)
  .then(() => {
    expressApp.use("/admin/queues", requireServiceToken, mountBullBoard(app));
    expressApp.use("/api", requireServiceToken, makeRouter(app));
    expressApp.use("/api/mailbox", requireServiceToken, makeMailboxRouter(app.mailboxController));
    expressApp.use("/api/lists", requireServiceToken, makeListsRouter(app.listController));
    expressApp.use("/pubsub", pubsubRouter);   // still mounts the public JWT-verified webhook route
    expressApp.use("/api/pubsub", pubsubRouter);
    expressApp.listen(3001, () => logger.info("Queue service listening on port 3001"));
  })
  .catch((err) => { logger.error({ err }, "Failed to initialize"); process.exit(1); });

process.on("SIGTERM", async () => { await shutdownApp(app); process.exit(0); });
process.on("SIGINT", async () => { await shutdownApp(app); process.exit(0); });
```

`shutdownApp` is the body of the current `ServiceManager.shutdown()` (lines 238–283), moved to `composition-root.ts` as a free function. Same shutdown order: PubSub → memory monitor → processors → queues → DLQs → Redis → watch cleanup.

### Step 6.5 — Delete `service-manager.ts`

After all callers are migrated, `service-manager.ts` (297 lines) and the `// TODO: Remove this if possible` factory are gone. `services/init.ts` was already deleted in Phase 5.

Grep confirms:
```
grep -rn "ServiceManager" apps/mailops/src        # zero matches
grep -rn "getInstance" apps/mailops/src           # matches only inside RedisConnection + MemoryMonitor (if you kept them as process-wide singletons)
```

### Step 6.6 — Infra singletons — DECIDED: keep all four as singletons

`RedisConnection`, `MemoryMonitor`, `RateLimitService`, `PubSubService` are *currently* singletons. **Decision locked: keep all four as process-wide singletons**, constructed inside `createApp()` with `getInstance()` called only there (not from anywhere else in the codebase).

Rationale: they're genuine process-wide resources (one Redis pool, one GC monitor, one rate-limit coordinator, one PubSub listener). Converting them to plain classes adds churn without clear value. The key win — removing `ServiceManager.getInstance()` from every processor and route — is already achieved in Steps 6.2–6.3. The infra singletons stay encapsulated in the composition root.

> Phase 7's tests can still inject fakes by constructing the services directly with the fakes (the constructors don't require the singleton path; only the convenience `getInstance()` accessor does).

## Definition of done

- [ ] `service-manager.ts` deleted.
- [ ] `composition-root.ts` owns all wiring (infra + repos + services + queues + processors + controllers).
- [ ] `server.ts` calls `createApp()` + `initializeApp()` + `makeRouter(app)`; nothing else.
- [ ] Every processor and controller takes its dependencies via constructor.
- [ ] `grep -rn "ServiceManager" apps/mailops/src` returns zero matches.
- [ ] Routes are built via `makeRouter(app)` factory.
- [ ] Phase 0 characterization tests pass.
- [ ] `tsc --noEmit` clean; ESLint clean.
- [ ] HTTP contract unchanged; graceful shutdown (SIGTERM/SIGINT) still works.

## What to commit

- "phase 6.1: move infra ownership into composition root"
- "phase 6.2: inject dependencies into processors via constructor"
- "phase 6.3: convert controllers to factories; routes take app"
- "phase 6.4: server.ts uses createApp + makeRouter"
- "phase 6.5: delete ServiceManager + init.ts"
- "phase 6.6: (optional) convert rate-limit + pubsub to plain classes"

## Risks

| Risk | Mitigation |
|---|---|
| Circular import between composition-root and a class that imports a type from it | Type-only imports (`import type`) avoid runtime cycles. The wiring imports real classes; the classes import only interfaces. |
| Bull-Board's API expects a specific shape from ServiceManager | `mountBullBoard` already takes a `ServiceManager`; refactor it to take `App` (or specifically the queues list). Small adapter. |
| `getInstance` removal breaks a missed caller | Grep before each commit. If a caller surfaces, migrate it in the same commit. |
| Long constructor param lists look ugly | Acceptable — they're honest. The composition root absorbs the noise; the class bodies shrink. Alternative (parameter objects) adds ceremony without value here. |
