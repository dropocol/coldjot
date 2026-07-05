/**
 * Domain service interface — one scheduler tick: find due contacts and enqueue
 * email jobs. Phase 4 replaces ScheduleProcessor.processScheduledEmails behind
 * this contract.
 */
export interface RunScheduleService {
  tick(): Promise<{ enqueued: number }>;
}
