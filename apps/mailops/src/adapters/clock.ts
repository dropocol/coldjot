/**
 * Adapter interface — abstracts `new Date()` so scheduled/timeout-sensitive
 * code can be tested deterministically and (eventually) time-traveled in dev.
 */
export interface Clock {
  /** Current wall-clock time. */
  now(): Date;
}
