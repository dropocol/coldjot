/**
 * Repository interface for the SequenceStep model.
 * Call sites: services/jobs/schedule/processor (step verification),
 * services/jobs/email/processor (getAndValidateSequenceStep + advancement).
 */

export interface SequenceStepRecord {
  id: string;
  sequenceId: string;
  order: number;
  stepType: string;
  timing: string;
  delayAmount: number | null;
  delayUnit: string | null;
  subject: string | null;
  content: string | null;
  includeSignature: boolean | null;
  note: string | null;
  previousStepId: string | null;
  replyToThread: boolean | null;
  templateId: string | null;
}

export interface StepWithSequenceMeta extends SequenceStepRecord {
  sequence: { id: string; userId: string; status: string; name: string };
}

export interface SequenceStepRepository {
  /** Verify a step exists for a sequence at a given order. */
  findBySequenceAndOrder(sequenceId: string, order: number): Promise<SequenceStepRecord | null>;
  /** Load a step + minimal sequence metadata (validation). */
  findWithSequenceMeta(stepId: string): Promise<StepWithSequenceMeta | null>;
  /** Count steps in a sequence (advancement logic). */
  countInSequence(sequenceId: string): Promise<number>;
  /** List steps in order (compute next step). */
  listBySequence(sequenceId: string): Promise<SequenceStepRecord[]>;
}
