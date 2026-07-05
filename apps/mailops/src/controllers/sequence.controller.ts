import { logger } from "@/lib/log";
import {
  ok,
  badRequest,
  notFound,
  serverError,
  type ControllerResult,
} from "./utils";
import type { LaunchSequenceService } from "@/services/domain/launch-sequence.service";
import {
  SequenceNotFoundError,
  SequenceHasNoStepsError,
  SequenceHasNoContactsError,
} from "@/services/domain/launch-sequence.service";

/**
 * Phase 7.2a: the sequence controller is a thin HTTP adapter. All sequence-
 * lifecycle logic (launch / pause / resume / reset) lives behind the
 * `LaunchSequenceService` interface; this layer maps the typed domain errors
 * to HTTP statuses.
 *
 * (Phase 6.4 made this a factory function; Phase 7.2a swapped the
 * jobManager/monitoring/repos/rateLimit deps for a single service dep.)
 */
export interface SequenceControllerDeps {
  launchSequenceService: LaunchSequenceService;
}

export function createSequenceController(deps: SequenceControllerDeps) {
  const { launchSequenceService: service } = deps;

  async function launchSequence(
    id: string,
    body: { userId: string }
  ): Promise<ControllerResult> {
    try {
      const { jobId, contactCount, stepCount } = await service.launch(
        id,
        body.userId
      );
      return ok({ success: true, jobId, contactCount, stepCount });
    } catch (error) {
      if (error instanceof SequenceNotFoundError) {
        return notFound("Sequence not found");
      }
      if (error instanceof SequenceHasNoStepsError) {
        return badRequest("Sequence has no steps");
      }
      if (error instanceof SequenceHasNoContactsError) {
        return badRequest("Sequence has no active contacts");
      }
      logger.error({ err: error }, "Error launching sequence");
      return serverError("Failed to launch sequence");
    }
  }

  async function pauseSequence(
    id: string,
    body: { userId: string }
  ): Promise<ControllerResult> {
    try {
      await service.pause(id, body.userId);
      return ok({ success: true });
    } catch (error) {
      if (error instanceof SequenceNotFoundError) {
        return notFound("Sequence not found");
      }
      logger.error({ err: error }, "Error pausing sequence");
      return serverError("Failed to pause sequence");
    }
  }

  async function resumeSequence(
    id: string,
    body: { userId: string }
  ): Promise<ControllerResult> {
    try {
      await service.resume(id, body.userId);
      return ok({ success: true });
    } catch (error) {
      if (error instanceof SequenceNotFoundError) {
        return notFound("Sequence not found");
      }
      logger.error({ err: error }, "Error resuming sequence");
      return serverError("Failed to resume sequence");
    }
  }

  async function resetSequenceHandler(
    id: string,
    body: { userId: string }
  ): Promise<ControllerResult> {
    try {
      await service.reset(id, body.userId);
      return ok({ success: true, message: "Sequence reset successfully" });
    } catch (error) {
      if (error instanceof SequenceNotFoundError) {
        return notFound("Sequence not found");
      }
      logger.error({ err: error }, "Error resetting sequence");
      return serverError("Failed to reset sequence");
    }
  }

  return {
    launchSequence,
    pauseSequence,
    resumeSequence,
    resetSequenceHandler,
  };
}
