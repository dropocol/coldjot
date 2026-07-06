import { logger } from "@/lib/log";
import { prisma } from "@coldjot/database";
import {
  ok,
  badRequest,
  serverError,
  type ControllerResult,
} from "./utils";

/** Phase 6.4: list controller is a factory (deps from composition root). */
export interface ListControllerDeps {}

export function createListController(_deps: ListControllerDeps = {}) {

  /** Create a sync record for a list (picked up by the watcher). */
  async function createSyncRecord(
    listId: string,
    body: { sequenceId?: string }
  ): Promise<ControllerResult> {
    try {
      const { sequenceId } = body;

      if (!listId) {
        return badRequest("List ID is required");
      }

      if (!sequenceId) {
        return badRequest("Sequence ID is required");
      }

      // Create a sync record that will be picked up by the watcher
      await prisma.listSyncRecord.record({ listId, sequenceId });

      logger.info({ listId, sequenceId }, "List sync record created");

      return ok({ success: true, message: "List sync record created" });
    } catch (error) {
      logger.error({ error }, "Failed to create list sync record");
      return serverError("Failed to create list sync record");
    }
  }

  return { createSyncRecord };
}
