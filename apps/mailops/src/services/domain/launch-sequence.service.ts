/**
 * Domain service interface — sequence lifecycle (launch/pause/resume/reset).
 * Phase 2 (routes → controllers) replaces the route controller functions
 * behind this contract.
 */
export interface LaunchSequenceService {
  launch(
    sequenceId: string,
    userId: string
  ): Promise<{ jobId: string; contactCount: number; stepCount: number }>;
  pause(sequenceId: string, userId: string): Promise<void>;
  resume(sequenceId: string, userId: string): Promise<void>;
  reset(sequenceId: string, userId: string): Promise<void>;
}
