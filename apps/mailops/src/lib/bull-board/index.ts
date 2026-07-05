import { Router } from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import type { Queue } from "bullmq";

/**
 * Mount Bull-Board for the mailops queues + DLQs.
 *
 * Returns an Express router the caller mounts behind the service-token
 * middleware (plan 03). Bull-Board gives ops a web UI to inspect/replay jobs
 * across every primary queue and its paired `*-dl` dead-letter queue.
 *
 * Phase 6.4: takes the queues list directly (was ServiceManager). The
 * composition root passes `[...app.queues.values(), ...app.dlQueues.values()]`.
 *
 * Plan 10 (`plans/refactor-plan/10-backend-job-resilience.md`).
 */
export function mountBullBoard(queues: Queue[]): Router {
  const serverAdapter = new ExpressAdapter();
  createBullBoard({
    queues: queues.map((q) => new BullMQAdapter(q)),
    serverAdapter,
  });

  return serverAdapter.getRouter();
}
