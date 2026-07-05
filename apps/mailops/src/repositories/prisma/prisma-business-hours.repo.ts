import { prisma } from "@coldjot/database";
import type { BusinessHours } from "@coldjot/types";
import type { BusinessHoursRepository } from "../business-hours.repo";

export class PrismaBusinessHoursRepository implements BusinessHoursRepository {
  async findBySequence(
    userId: string,
    sequenceId: string
  ): Promise<BusinessHours | null> {
    // sequence/controller.ts:36
    const row = await prisma.businessHours.findFirst({
      where: { userId, sequenceId },
    });
    return row as unknown as BusinessHours | null;
  }

  async createForSequence(
    userId: string,
    sequenceId: string,
    defaults: BusinessHours
  ): Promise<BusinessHours> {
    // sequence/controller.ts:45
    const row = await prisma.businessHours.create({
      data: {
        userId,
        sequenceId,
        timezone: defaults.timezone,
        workDays: defaults.workDays,
        workHoursStart: defaults.workHoursStart,
        workHoursEnd: defaults.workHoursEnd,
        type: defaults.type as any,
      },
    });
    return row as unknown as BusinessHours;
  }
}
