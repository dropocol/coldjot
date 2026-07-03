import { Router } from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import type { ServiceManager } from "@/services/service-manager";

/**
 * Mount Bull-Board for the mailops queues + DLQs.
 *
 * Returns an Express router the caller mounts behind the service-token
 * middleware (plan 03). Bull-Board gives ops a web UI to inspect/replay jobs
 * across every primary queue and its paired `*-dl` dead-letter queue.
 *
 * Plan 10 (`plans/refactor-plan/10-backend-job-resilience.md`).
 */
export function mountBullBoard(serviceManager: ServiceManager): Router {
  const queues = [...serviceManager.getAllQueues(), ...serviceManager.getAllDlQueues()];

  const serverAdapter = new ExpressAdapter();
  createBullBoard({
    queues: queues.map((q) => new BullMQAdapter(q)),
    serverAdapter,
  });

  return serverAdapter.getRouter();
}
