import { DateTime } from "luxon";
import {
  ProcessingJob,
  type StepType,
  RateLimits,
  SequenceStep,
  TimingType,
  BusinessHours,
  ProcessingWindow,
  StepTypeEnum,
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

  // TODO: Add rate limit consideration
  /**
   * Calculate next run time with rate limit consideration
   */
  async calculateNextRun(
    currentTime: Date,
    step: SequenceStep,
    businessHours: BusinessHours = this.defaultBusinessHours,
    rateLimits: RateLimits = this.defaultRateLimits,
    isDemoMode: boolean = false
  ): Promise<Date> {
    try {
      // Clear the log file at the start of each run
      if (isDevelopment) {
        const logPath = path.join(
          process.cwd(),
          "src",
          "lib",
          "schedule",
          "log.txt"
        );
        fs.writeFileSync(logPath, ""); // Clear the file
      }

      const effectiveCurrentTime = currentTime;
      const currentInBusinessTz = DateTime.fromJSDate(
        effectiveCurrentTime
      ).setZone(businessHours.timezone);

      logAndSave(
        `---
          🔄 Starting Next Run Calculation
          - Current Time UTC: ${effectiveCurrentTime.toISOString()}
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

      // For immediate timing, directly check and adjust business hours
      if (step.timing === TimingType.IMMEDIATE) {
        if (!isValidBusinessTime(currentInBusinessTz, businessHours)) {
          const adjustedTime = this.adjustToBusinessHours(
            currentInBusinessTz,
            businessHours
          );
          return adjustedTime.toUTC().toJSDate();
        }
        return currentInBusinessTz.toUTC().toJSDate();
      }

      // For delayed timing, calculate the delay
      const baseDelayMinutes = calculateBaseDelay(step, isDemoMode);
      const targetTime = currentInBusinessTz.plus({
        minutes: baseDelayMinutes,
      });

      logAndSave(
        `---
        🎯 Initial Target Time
        - In ${businessHours.timezone}: ${targetTime.toISO()}
        - Delay Minutes: ${baseDelayMinutes}
        ---`
      );

      // Check and adjust for business hours
      if (!isValidBusinessTime(targetTime, businessHours)) {
        const adjustedTime = this.adjustToBusinessHours(
          targetTime,
          businessHours
        );
        return adjustedTime.toUTC().toJSDate();
      }

      // Check rate limits and adjust if needed
      let attempts = 0;
      const maxAttempts = 5;
      let finalTime = targetTime;

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

        // Recheck business hours after rate limit adjustment
        if (!isValidBusinessTime(finalTime, businessHours)) {
          finalTime = this.adjustToBusinessHours(finalTime, businessHours);
        }
      }

      return finalTime.toUTC().toJSDate();
    } catch (error) {
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
  }

  private adjustToBusinessHours(
    date: DateTime,
    businessHours: BusinessHours
  ): DateTime {
    logAndSave("🕒 Starting business hours adjustment");

    const { workHoursStart, workHoursEnd, timezone } = businessHours;
    const [startHour, startMinute] = workHoursStart.split(":").map(Number);
    const [endHour, endMinute] = workHoursEnd.split(":").map(Number);

    // Ensure we're working in the correct timezone
    let result = date.setZone(timezone);

    logAndSave(`
      Initial time in business timezone:
      - Original: ${date.toISO()}
      - In ${timezone}: ${result.toISO()}
      - Business Hours: ${workHoursStart} - ${workHoursEnd}
    `);

    let iteration = 0;
    const maxIterations = 14;

    // First check if the current time is already valid
    if (isValidBusinessTime(result, businessHours)) {
      logDebugAndSave("✅ Time is already within business hours");
      return result;
    }

    while (
      !isValidBusinessTime(result, businessHours) &&
      iteration < maxIterations
    ) {
      iteration++;
      logDebugAndSave(`🔄 Adjustment iteration ${iteration}`);

      const dayStart = result.set({
        hour: startHour,
        minute: startMinute,
        second: 0,
        millisecond: 0,
      });
      const dayEnd = result.set({
        hour: endHour,
        minute: endMinute,
        second: 59,
        millisecond: 999,
      });

      if (result < dayStart || !isValidBusinessTime(result, businessHours)) {
        logDebugAndSave("📅 Invalid business day or before hours");
        result = nextBusinessStart(result, businessHours);
        continue;
      }

      if (result > dayEnd) {
        logDebugAndSave("🌙 After business hours");
        result = nextBusinessStart(result.plus({ days: 1 }), businessHours);
      }
    }

    // Add safe distribution within business hours
    const businessDayMinutes =
      endHour * 60 + endMinute - (startHour * 60 + startMinute);
    const bufferMinutes = 60;
    const safeStartMinutes = bufferMinutes;
    const safeEndMinutes = businessDayMinutes - bufferMinutes;
    const distributionMinutes =
      Math.floor(Math.random() * (safeEndMinutes - safeStartMinutes)) +
      safeStartMinutes;

    result = result
      .set({
        hour: startHour,
        minute: startMinute,
        second: Math.floor(Math.random() * 60),
        millisecond: Math.floor(Math.random() * 1000),
      })
      .plus({ minutes: distributionMinutes });

    logAndSave(`
      🎲 Added safe distribution:
      - Business Day Minutes: ${businessDayMinutes}
      - Safe Window: ${safeStartMinutes}-${safeEndMinutes} minutes
      - Added Minutes: ${distributionMinutes}
      - Final Time: ${result.toISO()}
    `);

    // Double-check we're still within business hours
    if (!isValidBusinessTime(result, businessHours)) {
      logAndSave(
        "⚠️ Distribution pushed time outside business hours, resetting to start of day"
      );
      result = result.set({
        hour: startHour + 1, // Start 1 hour after business hours start
        minute: Math.floor(Math.random() * 30), // Random minutes 0-29
        second: Math.floor(Math.random() * 60),
        millisecond: Math.floor(Math.random() * 1000),
      });
    }

    logAndSave(`
      ✅ Business hours adjustment complete:
      - Final time in ${timezone}: ${result.toISO()}
      - UTC time: ${result.toUTC().toISO()}
      - Business Hours: ${workHoursStart} - ${workHoursEnd}
    `);

    return result;
  }

  private async checkTimeSlotAvailability(
    dateTime: DateTime
  ): Promise<{ minuteAvailable: boolean; hourAvailable: boolean }> {
    // Get existing scheduled emails for this minute and hour
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

  private saveToLogFile(message: string) {
    if (isDevelopment) {
      logger.info(message);
      try {
        const logPath = path.join(
          process.cwd(),
          "src",
          "lib",
          "schedule",
          "log.txt"
        );
        const logDir = path.dirname(logPath);

        // Create directory if it doesn't exist
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }

        logger.info(`LOG-MESSAGE: ${logPath}`);
        fs.appendFileSync(logPath, `@coldjot/mailops:dev: ${message}\n`);
      } catch (error) {
        logger.error("Error writing to log file:", error);
      }
    }
  }

  private logAndSave(message: string) {
    logger.info(message);
    this.saveToLogFile(message);
  }

  private logDebugAndSave(message: string) {
    logger.debug(message);
    this.saveToLogFile(message);
  }

  private logErrorAndSave(message: string) {
    logger.error(message);
    this.saveToLogFile(message);
  }
}

// Export singleton instance
export const scheduleGenerator = ScheduleGenerator.getInstance();
