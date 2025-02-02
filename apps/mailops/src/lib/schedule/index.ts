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

  /**
   * Returns the current time. In production, this is always the real current time.
   */
  private getCurrentTime(): Date {
    return new Date();
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

      this.logAndSave(
        `---
          🔄 Starting Next Run Calculation
          - Current Time UTC: ${effectiveCurrentTime.toISOString()}
          - Current Time ${businessHours?.timezone || "Local"}: ${DateTime.fromJSDate(
            effectiveCurrentTime
          )
            .setZone(businessHours?.timezone || "local")
            .toISO()}
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

      const baseDelayMinutes = this.calculateBaseDelay(step, isDemoMode);
      this.logAndSave(
        `---
        📊 Base Delay Calculation
        - Base Delay (minutes): ${baseDelayMinutes}
        - Base Delay (hours): ${(baseDelayMinutes / 60).toFixed(2)}
        ---`
      );

      // Start with UTC
      const utcNow = DateTime.fromJSDate(effectiveCurrentTime, { zone: "utc" });
      let targetTime = utcNow.plus({ minutes: baseDelayMinutes });

      this.logAndSave(
        `---
        🎯 Initial Target Time
        - UTC Now: ${utcNow.toISO()}
        - Target Time UTC: ${targetTime.toISO()}
        - Target Time ${businessHours?.timezone || "Local"}: ${targetTime.setZone(businessHours?.timezone || "local").toISO()}
        - Added Minutes: ${baseDelayMinutes}
        - Time Difference: ${targetTime.diff(utcNow).toHuman()}
        ---`
      );

      if (!businessHours) {
        this.logAndSave(
          `---
          ⏭️ No Business Hours Defined
          - Returning UTC Target Time: ${targetTime.toISO()}
          - No Business Hours Adjustments Needed
          ---`
        );
        return targetTime.toJSDate();
      }

      // Convert target time to business timezone for checks
      let localTarget = targetTime.setZone(businessHours.timezone);

      this.logAndSave(
        `---
        🌐 Converting to Business Hours Timezone
        - From UTC: ${targetTime.toISO()}
        - To ${businessHours.timezone}: ${localTarget.toISO()}
        - Business Hours: ${businessHours.workHoursStart} - ${businessHours.workHoursEnd}
        - Work Days: ${businessHours.workDays.join(", ")}
        ---`
      );

      // Check if the target time needs business hours adjustment
      if (!this.isValidBusinessTime(localTarget, businessHours)) {
        const originalTarget = localTarget;
        localTarget = this.adjustToBusinessHours(localTarget, businessHours);
        this.logAndSave(
          `---
          ⚡ Business Hours Adjustment Required
          - Original Local Time: ${originalTarget.toISO()}
          - Adjusted Local Time: ${localTarget.toISO()}
          - Adjustment: ${localTarget.diff(originalTarget).toHuman()}
          ---`
        );
      } else {
        this.logAndSave(
          `---
          ✅ Target Time Already Within Business Hours
          - Local Time: ${localTarget.toISO()}
          - No Adjustment Needed
          ---`
        );
      }

      // Check rate limits and adjust if needed
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        const { minuteAvailable, hourAvailable } =
          await this.checkTimeSlotAvailability(localTarget);

        if (minuteAvailable && hourAvailable) {
          break;
        }

        this.logAndSave(
          `---
          ⚖️ Rate Limit Adjustment (Attempt ${attempts + 1})
          - Minute Available: ${minuteAvailable}
          - Hour Available: ${hourAvailable}
          - Current Local Time: ${localTarget.toISO()}
          ---`
        );

        // Adjust time based on availability
        if (!minuteAvailable) {
          const distributionMinutes = Math.floor(
            Math.random() * RATE_LIMIT_CONFIG.SCHEDULING.DISTRIBUTION_WINDOW
          );
          localTarget = localTarget.plus({ minutes: distributionMinutes });
          this.logAndSave(
            `---
            ⏱️ Minute Rate Limit Adjustment
            - Added Minutes: ${distributionMinutes}
            - New Local Target: ${localTarget.toISO()}
            ---`
          );
        }

        if (!hourAvailable) {
          localTarget = localTarget.plus({ hours: 1 });
          const distributionMinutes = Math.floor(Math.random() * 60);
          localTarget = localTarget.set({ minute: distributionMinutes });
          this.logAndSave(
            `---
            ⏰ Hour Rate Limit Adjustment
            - Added Hours: 1
            - Random Minutes: ${distributionMinutes}
            - New Local Target: ${localTarget.toISO()}
            ---`
          );
        }

        // If we've moved outside business hours, find next business day
        if (!this.isValidBusinessTime(localTarget, businessHours)) {
          const oldTarget = localTarget;
          localTarget = this.nextBusinessStart(localTarget, businessHours);
          this.logAndSave(
            `---
            📅 Business Hours Adjustment After Rate Limit
            - Outside Business Hours Detected
            - Old Local Target: ${oldTarget.toISO()}
            - New Local Target: ${localTarget.toISO()}
            - Adjustment: ${localTarget.diff(oldTarget).toHuman()}
            ---`
          );
        }

        attempts++;
      }

      // Convert back to UTC for storage
      const finalUtc = localTarget.toUTC();

      this.logAndSave(
        `---
        ✅ Final Calculation Complete
        - Original Time UTC: ${effectiveCurrentTime.toISOString()}
        - Original Time ${businessHours.timezone}: ${DateTime.fromJSDate(effectiveCurrentTime).setZone(businessHours.timezone).toISO()}
        - Final Time UTC: ${finalUtc.toISO()}
        - Final Time ${businessHours.timezone}: ${localTarget.toISO()}
        - Total Delay: ${finalUtc.diff(utcNow, ["hours", "minutes"]).toHuman()}
        - Business Hours:
          • Start: ${businessHours.workHoursStart}
          • End: ${businessHours.workHoursEnd}
          • Timezone: ${businessHours.timezone}
        - Rate Limit Attempts: ${attempts}
        ---`
      );

      return finalUtc.toJSDate();
    } catch (error) {
      this.logErrorAndSave(
        `---
        ❌ Error Calculating Next Run
        - Error: ${error instanceof Error ? error.message : "Unknown error"}
        - Fallback: Adding 1 hour to current time
        ---`
      );
      return DateTime.fromJSDate(currentTime, { zone: "utc" })
        .plus({ hours: 1 })
        .toJSDate();
    }
  }

  private calculateBaseDelay(step: SequenceStep, isDemoMode: boolean): number {
    this.logAndSave("⌛ Starting base delay calculation");

    let delay: number;

    logger.info(step, "🕒 Step");
    switch (step.stepType.toUpperCase()) {
      case StepTypeEnum.WAIT:
        if (!step.delayAmount || !step.delayUnit) {
          delay = RATE_LIMIT_CONFIG.SCHEDULING.DEFAULT_DELAY;
          this.logDebugAndSave("Using default delay for WAIT step");
        } else {
          delay = this.convertToMinutes(step.delayAmount, step.delayUnit);
          // Add natural distribution for longer delays
          if (step.delayUnit.toLowerCase() === "days") {
            // For day-based delays, add 1-4 hours of random variation
            const additionalHours = Math.floor(Math.random() * 4) + 1;
            const additionalMinutes = Math.floor(Math.random() * 60);
            delay += additionalHours * 60 + additionalMinutes;
            this.logDebugAndSave(
              `⏳ Added natural distribution of ${additionalHours}h ${additionalMinutes}m to day-based delay`
            );
          } else if (step.delayUnit.toLowerCase() === "hours") {
            // For hour-based delays, add 5-30 minutes of random variation
            const additionalMinutes = Math.floor(Math.random() * 26) + 5;
            delay += additionalMinutes;
            this.logDebugAndSave(
              `⏳ Added natural distribution of ${additionalMinutes}m to hour-based delay`
            );
          }
          this.logDebugAndSave("⏳ Calculated WAIT delay");
        }
        break;

      case StepTypeEnum.MANUAL_EMAIL:
      case StepTypeEnum.AUTOMATED_EMAIL:
        if (step.timing === TimingType.IMMEDIATE) {
          // TODO : Add couple of minutes of delay. Default it to 30 minutes
          delay = 0; // No delay for immediate
          this.logDebugAndSave("⚡ Immediate email, no delay");
        } else if (step.timing === TimingType.DELAY && step.delayAmount) {
          delay = this.convertToMinutes(step.delayAmount, step.delayUnit!);
          // Add natural distribution for longer delays
          if (step.delayUnit?.toLowerCase() === "days") {
            // For day-based delays, add 1-3 hours of random variation
            const additionalHours = Math.floor(Math.random() * 3) + 1;
            const additionalMinutes = Math.floor(Math.random() * 60);
            delay += additionalHours * 60 + additionalMinutes;
            this.logDebugAndSave(
              `⏳ Added natural distribution of ${additionalHours}h ${additionalMinutes}m to day-based delay`
            );
          } else if (step.delayUnit?.toLowerCase() === "hours") {
            // For hour-based delays, add 5-30 minutes of random variation
            const additionalMinutes = Math.floor(Math.random() * 26) + 5;
            delay += additionalMinutes;
            this.logDebugAndSave(
              `⏳ Added natural distribution of ${additionalMinutes}m to hour-based delay`
            );
          }
          this.logDebugAndSave(
            "⏰ Using specified delay with natural distribution"
          );
        } else {
          delay = RATE_LIMIT_CONFIG.SCHEDULING.DEFAULT_DELAY;
          this.logDebugAndSave("⚠️ No timing specified, using default delay");
        }
        break;

      default:
        delay = RATE_LIMIT_CONFIG.SCHEDULING.DEFAULT_DELAY;
        this.logDebugAndSave("⚠️ Unknown step type, using default delay");
    }

    // Only apply minimum delay if it's more than DEFAULT_DELAY
    if (delay > RATE_LIMIT_CONFIG.SCHEDULING.DEFAULT_DELAY) {
      delay = Math.max(delay, RATE_LIMIT_CONFIG.SCHEDULING.MIN_DELAY);
      this.logAndSave("📊 Applied minimum delay threshold");
    } else {
      this.logAndSave("📊 Using exact delay");
    }

    if (isDemoMode) {
      const originalDelay = delay;
      delay = Math.min(delay, 480); // Cap at 8 hours for demo mode
      this.logAndSave("🎮 Demo mode delay adjustment");
    }

    this.logAndSave(`✅ Final base delay calculated: ${delay} minutes`);

    return delay;
  }

  private convertToMinutes(amount: number, unit: string): number {
    switch (unit.toLowerCase()) {
      case "minutes":
      case "minute":
        return amount;
      case "hours":
      case "hour":
        return amount * 60;
      case "days":
      case "day":
        return amount * 24 * 60;
      default:
        this.logAndSave(
          `⚠️ Unknown time unit: ${unit}, defaulting to 60 minutes`
        );
        return 60; // default to 1 hour
    }
  }

  private isValidBusinessTime(
    dt: DateTime,
    businessHours: BusinessHours
  ): boolean {
    // If in demo mode, always return true
    if (BYPASS_BUSINESS_HOURS) {
      this.logDebugAndSave("🎮 Demo mode: Bypassing business hours check");
      return true;
    }

    const { workDays, holidays, timezone } = businessHours;

    // Check if holiday
    const isHoliday = holidays.some((h) =>
      dt.hasSame(DateTime.fromJSDate(h, { zone: timezone }), "day")
    );

    // Check if workday
    const isWorkDay = workDays.includes(dt.weekday % 7);

    const [startHour, startMinute] = businessHours.workHoursStart
      .split(":")
      .map(Number);
    const [endHour, endMinute] = businessHours.workHoursEnd
      .split(":")
      .map(Number);

    const dayStart = dt.set({
      hour: startHour,
      minute: startMinute,
      second: 0,
    });
    const dayEnd = dt.set({ hour: endHour, minute: endMinute, second: 0 });

    const isWithinHours = dt >= dayStart && dt <= dayEnd;

    this.logDebugAndSave("🔍 Checking business time validity");

    return !isHoliday && isWorkDay && isWithinHours;
  }

  private adjustToBusinessHours(
    date: DateTime,
    businessHours: BusinessHours
  ): DateTime {
    this.logAndSave("🕒 Starting business hours adjustment");

    // If in demo mode, return the date as is
    if (BYPASS_BUSINESS_HOURS) {
      this.logDebugAndSave("🎮 Demo mode: Skipping business hours adjustment");
      return date;
    }

    const { workHoursStart, workHoursEnd, workDays, holidays, timezone } =
      businessHours;
    const [startHour, startMinute] = workHoursStart.split(":").map(Number);
    const [endHour, endMinute] = workHoursEnd.split(":").map(Number);

    let result = date;
    let iteration = 0;
    const maxIterations = 14;

    // First check if the current time is already valid
    if (this.isValidBusinessTime(result, businessHours)) {
      this.logDebugAndSave("✅ Time is already within business hours");
      return result;
    }

    while (
      !this.isValidBusinessTime(result, businessHours) &&
      iteration < maxIterations
    ) {
      iteration++;
      this.logDebugAndSave(`🔄 Adjustment iteration ${iteration}`);

      const dayStart = result.set({
        hour: startHour,
        minute: startMinute,
        second: 0,
      });
      const dayEnd = result.set({
        hour: endHour,
        minute: endMinute,
        second: 0,
      });

      // If holiday/not a workday or before dayStart
      if (
        !workDays.includes(result.weekday % 7) ||
        holidays.some((h) =>
          result.hasSame(DateTime.fromJSDate(h, { zone: timezone }), "day")
        ) ||
        result < dayStart
      ) {
        this.logDebugAndSave("📅 Invalid business day or before hours");
        // Move to the start of the next valid day
        result = this.nextBusinessStart(result, businessHours);
        continue;
      }

      // If after business hours
      if (result > dayEnd) {
        this.logDebugAndSave("🌙 After business hours");
        result = this.nextBusinessStart(
          result.plus({ days: 1 }),
          businessHours
        );
      }
    }

    // Add distribution within the business day ONLY if we had to adjust the time
    if (iteration > 0) {
      const businessDayMinutes =
        endHour * 60 + endMinute - (startHour * 60 + startMinute);
      const distributionMinutes = Math.floor(
        Math.random() * businessDayMinutes
      );

      // Calculate the distributed time
      result = result
        .set({
          hour: startHour,
          minute: startMinute,
          second: Math.floor(Math.random() * 60),
          millisecond: Math.floor(Math.random() * 1000),
        })
        .plus({ minutes: distributionMinutes });
    }

    this.logAndSave("✅ Business hours adjustment complete");

    return result;
  }

  /**
   * Check if the time slot is available based on rate limits
   */
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

  private nextBusinessStart(
    date: DateTime,
    businessHours: BusinessHours
  ): DateTime {
    this.logAndSave("🔄 Finding next business day start");

    const { workHoursStart, workDays, holidays, timezone } = businessHours;
    const [startHour, startMinute] = workHoursStart.split(":").map(Number);

    let candidate = date
      .startOf("day")
      .set({ hour: startHour, minute: startMinute });
    let iteration = 0;
    const maxIterations = 14;

    while (iteration < maxIterations) {
      iteration++;
      const isHoliday = holidays.some((h) =>
        candidate.hasSame(DateTime.fromJSDate(h, { zone: timezone }), "day")
      );
      const isWorkDay = workDays.includes(candidate.weekday % 7);

      this.logDebugAndSave(
        `📅 Checking candidate day (iteration ${iteration})`
      );

      if (!isHoliday && isWorkDay) {
        this.logDebugAndSave("✅ Valid business day found");
        return candidate;
      }

      candidate = candidate
        .plus({ days: 1 })
        .set({ hour: startHour, minute: startMinute });
    }

    this.logAndSave(
      "⚠️ Max iterations reached while finding next business day"
    );

    return candidate;
  }

  private saveToLogFile(message: string) {
    if (isDevelopment) {
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

        fs.appendFileSync(logPath, `@coldjot/queue:dev: ${message}\n`);
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
