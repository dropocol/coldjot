import { prisma } from "@coldjot/database";
import type {
  SequenceStepRepository,
  SequenceStepRecord,
  StepWithSequenceMeta,
} from "../sequence-step.repo";

export class PrismaSequenceStepRepository implements SequenceStepRepository {
  async findBySequenceAndOrder(
    sequenceId: string,
    order: number
  ): Promise<SequenceStepRecord | null> {
    // schedule/processor.ts:353
    const row = await prisma.sequenceStep.findFirst({
      where: { sequenceId, order },
    });
    return row as unknown as SequenceStepRecord | null;
  }

  async findWithSequenceMeta(
    stepId: string
  ): Promise<StepWithSequenceMeta | null> {
    // jobs/email/processor.ts:318
    const row = await prisma.sequenceStep.findUnique({
      where: { id: stepId },
      include: { sequence: { select: { id: true, userId: true, status: true, name: true } } },
    });
    return row as unknown as StepWithSequenceMeta | null;
  }

  async countInSequence(sequenceId: string): Promise<number> {
    // jobs/email/processor.ts:350
    return prisma.sequenceStep.count({ where: { sequenceId } });
  }

  async listBySequence(sequenceId: string): Promise<SequenceStepRecord[]> {
    // jobs/email/processor.ts:377
    const rows = await prisma.sequenceStep.findMany({
      where: { sequenceId },
      orderBy: { order: "asc" },
    });
    return rows as unknown as SequenceStepRecord[];
  }
}
