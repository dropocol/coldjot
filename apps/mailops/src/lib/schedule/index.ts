import { DateTime } from "luxon";
import {
  RateLimits,
  SequenceStep,
  TimingType,
  BusinessHours,
} from "@coldjot/types";
import { logger } from "@/lib/log";
import { prisma } from "@coldjot/database";
import { RATE_LIMIT_CONFIG } from "@/config/rate-limit/constants";
import { isDevelopment, BYPASS_BUSINESS_HOURS } from "@/config";
import { DEFAULT_BUSINESS_HOURS } from "@/config";
import * as fs from "fs";
import * as path from "path";
import {
  logAndSave,
  logDebugAndSave,
  logErrorAndSave,
  isValidBusinessTime,
  nextBusinessStart,
  calculateBaseDelay,
  calculateDistribution,
} from "./helper";

export interface ScheduleGenerator {
  calculateNextRun(
    currentTime: Date,
    step: SequenceStep,
    businessHours?: BusinessHours,
    rateLimits?: RateLimits,
    isDemoMode?: boolean
  ): Promise<Date>;
}

export class ScheduleGenerator implements ScheduleGenerator {
  private static instance: ScheduleGenerator;
  private defaultRateLimits: RateLimits = RATE_LIMIT_CONFIG.DEFAULT_LIMITS;
  private defaultBusinessHours: BusinessHours = DEFAULT_BUSINESS_HOURS;

  private constructor() {
    logger.info("🕒 Initializing SchedulingService");
  }

  public static getInstance(): ScheduleGenerator {
    if (!ScheduleGenerator.instance) {
      ScheduleGenerator.instance = new ScheduleGenerator();
    }
    return ScheduleGenerator.instance;
  }

  // -------------------------------------------
  // -------------------------------------------
  // -------------------------------------------

  private clearLogFile(): void {
    if (isDevelopment) {
      const logPath = path.join(
        process.cwd(),
        "src",
        "lib",
        "schedule",
        "log.txt"
      );
      fs.writeFileSync(logPath, "");
    }
  }

  // -------------------------------------------
  // -------------------------------------------
  // -------------------------------------------

  private logInitialState(
    currentTime: Date,
    step: SequenceStep,
    businessHours: BusinessHours,
    isDemoMode: boolean
  ): void {
    const currentInBusinessTz = DateTime.fromJSDate(currentTime).setZone(
      businessHours.timezone
    );
    logAndSave(
      `---
        🔄 Starting Next Run Calculation
        - Current Time UTC: ${currentTime.toISOString()}
        - Current Time ${businessHours?.timezone}: ${currentInBusinessTz.toISO()}
        - Step Type: ${step.stepType}
        - Timing: ${step.timing}
        - Delay Amount: ${step.delayAmount || "N/A"}
        - Delay Unit: ${step.delayUnit || "N/A"}
        - Demo Mode: ${isDemoMode}
        - Has Business Hours: ${!!businessHours}
        - Business Hours Timezone: ${businessHours?.timezone}
        - Development Mode: ${isDevelopment}
        ---`
    );
  }

  // -------------------------------------------
  // -------------------------------------------
  // -------------------------------------------

  async calculateNextRun(
    currentTime: Date,
    step: SequenceStep,
    businessHours: BusinessHours = this.defaultBusinessHours,
    rateLimits: RateLimits = this.defaultRateLimits,
    isDemoMode: boolean = false
  ): Promise<Date> {
    try {
      this.clearLogFile();
      this.logInitialState(currentTime, step, businessHours, isDemoMode);

      const currentInBusinessTz = DateTime.fromJSDate(currentTime).setZone(
        businessHours.timezone
      );

      // Handle immediate timing
      if (step.timing === TimingType.IMMEDIATE) {
        return this.handleImmediateTiming(currentInBusinessTz, businessHours);
      }

      // Handle delayed timing
      return this.handleDelayedTiming(
        currentInBusinessTz,
        step,
        businessHours,
        isDemoMode
      );
    } catch (error) {
      return this.handleError(error, currentTime, businessHours);
    }
  }

  // -------------------------------------------
  // -------------------------------------------
  // -------------------------------------------

  private async handleImmediateTiming(
    currentTime: DateTime,
    businessHours: BusinessHours
  ): Promise<Date> {
    logDebugAndSave(`
      ⚡ Handling Immediate Timing:
      - Current Time: ${currentTime.toISO()}
    `);

    // Add base distribution for immediate timing
    const baseDistribution = calculateDistribution(
      undefined,
      undefined,
      false,
      true
    );
    let targetTime = currentTime.plus({
      minutes: baseDistribution.minutes,
      seconds: baseDistribution.seconds,
      milliseconds: baseDistribution.milliseconds,
    });

    logDebugAndSave(`
      🎯 Added Base Distribution:
      - Original Time: ${currentTime.toISO()}
      - Added Minutes: ${baseDistribution.minutes}
      - New Time: ${targetTime.toISO()}
    `);

    if (!isValidBusinessTime(targetTime, businessHours)) {
      logDebugAndSave(`
        ⚠️ Time after base distribution is outside business hours:
        - Time: ${targetTime.toISO()}
        - Adjusting to business hours
      `);
      targetTime = this.adjustToBusinessHours(targetTime, businessHours);
    }

    return targetTime.toUTC().toJSDate();
  }

  // -------------------------------------------
  // -------------------------------------------
  // -------------------------------------------

  private async handleDelayedTiming(
    currentTime: DateTime,
    step: SequenceStep,
    businessHours: BusinessHours,
    isDemoMode: boolean
  ): Promise<Date> {
    const baseDelayMinutes = calculateBaseDelay(step, isDemoMode);
    const targetTime = currentTime.plus({ minutes: baseDelayMinutes });

    logAndSave(
      `---
      🎯 Initial Target Time
      - In ${businessHours.timezone}: ${targetTime.toISO()}
      - Delay Minutes: ${baseDelayMinutes}
      ---`
    );

    if (!isValidBusinessTime(targetTime, businessHours)) {
      const adjustedTime = this.adjustToBusinessHours(
        targetTime,
        businessHours
      );
      return adjustedTime.toUTC().toJSDate();
    }

    const finalTime = await this.applyRateLimits(targetTime, businessHours);
    return finalTime.toUTC().toJSDate();
  }

  // -------------------------------------------
  // -------------------------------------------
  // -------------------------------------------

  private async applyRateLimits(
    time: DateTime,
    businessHours: BusinessHours
  ): Promise<DateTime> {
    let attempts = 0;
    const maxAttempts = 5;
    let finalTime = time;

    while (attempts < maxAttempts) {
      const { minuteAvailable, hourAvailable } =
        await this.checkTimeSlotAvailability(finalTime);

      if (minuteAvailable && hourAvailable) {
        break;
      }

      attempts++;
      if (!minuteAvailable) {
        finalTime = finalTime.plus({ minutes: 5 });
      }
      if (!hourAvailable) {
        finalTime = finalTime.plus({ hours: 1 });
      }

      if (!isValidBusinessTime(finalTime, businessHours)) {
        finalTime = this.adjustToBusinessHours(finalTime, businessHours);
      }
    }

    return finalTime;
  }

  // -------------------------------------------
  // -------------------------------------------
  // -------------------------------------------

  private adjustToBusinessHours(
    date: DateTime,
    businessHours: BusinessHours
  ): DateTime {
    logDebugAndSave(`
      🕒 Starting Business Hours Adjustment:
      - Original Time: ${date.toISO()}
      - Business Hours: ${businessHours.workHoursStart} - ${businessHours.workHoursEnd}
      - Timezone: ${businessHours.timezone}
    `);

    const { workHoursStart, timezone } = businessHours;
    const [startHour, startMinute] = workHoursStart.split(":").map(Number);
    let result = date.setZone(timezone);

    // First check if the current time is already valid
    if (isValidBusinessTime(result, businessHours)) {
      logDebugAndSave(`
        ✅ Time is already within business hours:
        - Time: ${result.toISO()}
        - No adjustment needed
      `);
      return result;
    }

    // Find next valid business time
    let iteration = 0;
    const maxIterations = 14;

    while (
      !isValidBusinessTime(result, businessHours) &&
      iteration < maxIterations
    ) {
      iteration++;
      logDebugAndSave(`
        🔄 Adjustment Iteration ${iteration}:
        - Current Time: ${result.toISO()}
      `);
      result = this.findNextValidTime(result, businessHours);
    }

    logDebugAndSave(`
      📅 Found Valid Business Day:
      - Time: ${result.toISO()}
      - Iterations: ${iteration}
    `);

    // Apply distribution
    const distribution = calculateDistribution(businessHours, undefined, true);
    logDebugAndSave(`
      🎲 Applying Distribution:
      - Base Time: ${result.toISO()}
      - Distribution Values:
        * Minutes: ${distribution.minutes}
        * Seconds: ${distribution.seconds}
        * Milliseconds: ${distribution.milliseconds}
    `);

    result = result
      .set({
        hour: startHour,
        minute: startMinute,
        second: distribution.seconds,
        millisecond: distribution.milliseconds,
      })
      .plus({ minutes: distribution.minutes });

    logDebugAndSave(`
      ⏰ After Distribution:
      - Time: ${result.toISO()}
    `);

    // Fallback if distribution pushes outside business hours
    if (!isValidBusinessTime(result, businessHours)) {
      logDebugAndSave(`
        ⚠️ Distribution pushed time outside business hours:
        - Invalid Time: ${result.toISO()}
        - Resetting to safe time
      `);

      result = result.set({
        hour: startHour + 1,
        minute: Math.floor(Math.random() * 30),
        second: Math.floor(Math.random() * 60),
        millisecond: Math.floor(Math.random() * 1000),
      });

      logDebugAndSave(`
        🔧 Reset to Safe Time:
        - New Time: ${result.toISO()}
      `);
    }

    logDebugAndSave(`
      ✅ Business Hours Adjustment Complete:
      - Original Time: ${date.toISO()}
      - Final Time: ${result.toISO()}
      - In UTC: ${result.toUTC().toISO()}
    `);

    return result;
  }

  // -------------------------------------------
  // -------------------------------------------
  // -------------------------------------------

  private findNextValidTime(
    time: DateTime,
    businessHours: BusinessHours
  ): DateTime {
    const { workHoursStart, workHoursEnd } = businessHours;
    const [startHour, startMinute] = workHoursStart.split(":").map(Number);
    const [endHour, endMinute] = workHoursEnd.split(":").map(Number);

    const dayStart = time.set({
      hour: startHour,
      minute: startMinute,
      second: 0,
      millisecond: 0,
    });

    const dayEnd = time.set({
      hour: endHour,
      minute: endMinute,
      second: 59,
      millisecond: 999,
    });

    // If time is after business hours, always move to next business day
    if (time.hour * 60 + time.minute > endHour * 60 + endMinute) {
      logDebugAndSave(`
        🌙 Time is after business hours:
        - Current: ${time.hour}:${time.minute}
        - Business End: ${endHour}:${endMinute}
        - Moving to next business day
      `);
      return nextBusinessStart(time.plus({ days: 1 }), businessHours);
    }

    // If time is before business hours on the same day
    if (time.hour * 60 + time.minute < startHour * 60 + startMinute) {
      logDebugAndSave(`
        🌅 Time is before business hours:
        - Current: ${time.hour}:${time.minute}
        - Business Start: ${startHour}:${startMinute}
        - Moving to business start today
      `);
      return nextBusinessStart(time, businessHours);
    }

    // If time is not a valid business time for other reasons (holiday, non-workday)
    if (!isValidBusinessTime(time, businessHours)) {
      logDebugAndSave(`
        📅 Invalid business day:
        - Current: ${time.toISO()}
        - Moving to next valid business day
      `);
      return nextBusinessStart(time.plus({ days: 1 }), businessHours);
    }

    return time;
  }

  // -------------------------------------------
  // -------------------------------------------
  // -------------------------------------------

  private handleError(
    error: unknown,
    currentTime: Date,
    businessHours: BusinessHours
  ): Date {
    logErrorAndSave(
      `---
      ❌ Error Calculating Next Run
      - Error: ${error instanceof Error ? error.message : "Unknown error"}
      - Fallback: Next business hour start
      ---`
    );
    return this.adjustToBusinessHours(
      DateTime.fromJSDate(currentTime).setZone(businessHours.timezone),
      businessHours
    )
      .toUTC()
      .toJSDate();
  }

  // -------------------------------------------
  // -------------------------------------------
  // -------------------------------------------

  private async checkTimeSlotAvailability(
    dateTime: DateTime
  ): Promise<{ minuteAvailable: boolean; hourAvailable: boolean }> {
    const existingScheduled = await prisma.sequenceContact.count({
      where: {
        nextScheduledAt: {
          gte: dateTime.minus({ minutes: 1 }).toJSDate(),
          lt: dateTime.plus({ minutes: 1 }).toJSDate(),
        },
      },
    });

    const existingScheduledHour = await prisma.sequenceContact.count({
      where: {
        nextScheduledAt: {
          gte: dateTime.minus({ hours: 1 }).toJSDate(),
          lt: dateTime.plus({ hours: 1 }).toJSDate(),
        },
      },
    });

    return {
      minuteAvailable:
        existingScheduled < RATE_LIMIT_CONFIG.SCHEDULING.MAX_EMAILS_PER_MINUTE,
      hourAvailable:
        existingScheduledHour <
        RATE_LIMIT_CONFIG.SCHEDULING.MAX_EMAILS_PER_HOUR,
    };
  }
}

// Export singleton instance
export const scheduleGenerator = ScheduleGenerator.getInstance();
