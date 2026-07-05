/**
 * Stub helpers for the infra-ish collaborators the domain services + processors
 * depend on: `JobManager` (records added jobs) and `RateLimitService` (records
 * checks + increments). These are call-recording stubs, not full fakes — just
 * enough surface for the tests to assert "addEmailJob was called with …".
 */
import type { Job } from "bullmq";
import type { ProcessingJob, EmailJob } from "@coldjot/types";
import type { JobManager } from "@/services/jobs/job-manager";
import type { RateLimitService } from "@/services/core/rate-limit/service";

/** A `JobManager` that records every added job and returns a canned Job. */
export class FakeJobManager implements Pick<JobManager, "addSequenceJob" | "addEmailJob"> {
  sequenceJobs: ProcessingJob[] = [];
  emailJobs: EmailJob[] = [];
  nextJobId = "job-1";

  async addSequenceJob(job: ProcessingJob): Promise<Job> {
    this.sequenceJobs.push(job);
    return { id: this.nextJobId } as Job;
  }

  async addEmailJob(job: EmailJob): Promise<Job> {
    this.emailJobs.push(job);
    return { id: this.nextJobId } as Job;
  }

  reset(): void {
    this.sequenceJobs = [];
    this.emailJobs = [];
  }
}

/** A `RateLimitService` whose results tests control. */
export class FakeRateLimitService
  implements Pick<RateLimitService, "checkRateLimit" | "incrementCounters" | "resetLimits">
{
  /** Defaults to allowed; tests override per scenario. */
  allowed = true;
  checkCalls: Array<{ userId: string; sequenceId?: string; contactId?: string }> = [];
  incrementCalls: Array<{ userId: string; sequenceId?: string; contactId?: string }> = [];
  resetCalls: Array<{ userId: string; sequenceId?: string; contactId?: string }> = [];

  async checkRateLimit(
    userId: string,
    sequenceId?: string,
    contactId?: string
  ): Promise<{ allowed: boolean }> {
    this.checkCalls.push({ userId, sequenceId, contactId });
    return { allowed: this.allowed };
  }

  async incrementCounters(
    userId: string,
    sequenceId?: string,
    contactId?: string
  ): Promise<void> {
    this.incrementCalls.push({ userId, sequenceId, contactId });
  }

  async resetLimits(
    userId: string,
    sequenceId?: string,
    contactId?: string
  ): Promise<void> {
    this.resetCalls.push({ userId, sequenceId, contactId });
  }

  reset(): void {
    this.allowed = true;
    this.checkCalls = [];
    this.incrementCalls = [];
    this.resetCalls = [];
  }
}
