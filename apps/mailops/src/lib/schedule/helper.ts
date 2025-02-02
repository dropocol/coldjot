import { DateTime } from "luxon";
import { logger } from "@/lib/log";
import fs from "fs";
import path from "path";
import {
  BusinessHours,
  SequenceStep,
  TimingType,
  StepTypeEnum,
} from "@coldjot/types";
import { RATE_LIMIT_CONFIG } from "@/config/rate-limit/constants";
import { isDevelopment } from "@/config";

// Logging utilities
export const saveToLogFile = (message: string) => {
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

      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      logger.info(`LOG-MESSAGE: ${logPath}`);
      fs.appendFileSync(logPath, `@coldjot/mailops:dev: ${message}\n`);
    } catch (error) {
      logger.error("Error writing to log file:", error);
    }
  }
};

export const logAndSave = (message: string) => {
  logger.info(message);
  saveToLogFile(message);
};

export const logDebugAndSave = (message: string) => {
  logger.debug(message);
  saveToLogFile(message);
};

export const logErrorAndSave = (message: string) => {
  logger.error(message);
  saveToLogFile(message);
};

// Business hours utilities
export const isValidBusinessTime = (
  dt: DateTime,
  businessHours: BusinessHours,
  bypassBusinessHours: boolean = false
): boolean => {
  if (bypassBusinessHours) {
    logDebugAndSave("🎮 Demo mode: Bypassing business hours check");
    return true;
  }

  const { workDays, holidays, timezone } = businessHours;
  const localDt = dt.setZone(timezone);

  const isHoliday = holidays.some((h) =>
    localDt.hasSame(DateTime.fromJSDate(h, { zone: timezone }), "day")
  );

  const isWorkDay = workDays.includes(localDt.weekday % 7);

  const [startHour, startMinute] = businessHours.workHoursStart
    .split(":")
    .map(Number);
  const [endHour, endMinute] = businessHours.workHoursEnd
    .split(":")
    .map(Number);

  const dayStart = localDt.set({
    hour: startHour,
    minute: startMinute,
    second: 0,
    millisecond: 0,
  });

  const dayEnd = localDt.set({
    hour: endHour,
    minute: endMinute,
    second: 59,
    millisecond: 999,
  });

  const isWithinHours = localDt >= dayStart && localDt <= dayEnd;

  logDebugAndSave(`
    🔍 Business Hours Check:
    - Local Time: ${localDt.toISO()}
    - Day Start: ${dayStart.toISO()}
    - Day End: ${dayEnd.toISO()}
    - Is Work Day: ${isWorkDay}
    - Is Holiday: ${isHoliday}
    - Is Within Hours: ${isWithinHours}
    - Timezone: ${timezone}
  `);

  return !isHoliday && isWorkDay && isWithinHours;
};

export const nextBusinessStart = (
  date: DateTime,
  businessHours: BusinessHours
): DateTime => {
  logAndSave("🔄 Finding next business day start");

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

    logDebugAndSave(`📅 Checking candidate day (iteration ${iteration})`);

    if (!isHoliday && isWorkDay) {
      logDebugAndSave("✅ Valid business day found");
      return candidate;
    }

    candidate = candidate
      .plus({ days: 1 })
      .set({ hour: startHour, minute: startMinute });
  }

  logAndSave("⚠️ Max iterations reached while finding next business day");
  return candidate;
};

// Delay calculation utilities
export const calculateBaseDelay = (
  step: SequenceStep,
  isDemoMode: boolean
): number => {
  logAndSave("⌛ Starting base delay calculation");

  let delay: number;

  logger.info(step, "🕒 Step");
  switch (step.stepType.toUpperCase()) {
    case StepTypeEnum.WAIT:
      if (!step.delayAmount || !step.delayUnit) {
        delay = RATE_LIMIT_CONFIG.SCHEDULING.DEFAULT_DELAY;
        logDebugAndSave("Using default delay for WAIT step");
      } else {
        delay = convertToMinutes(step.delayAmount, step.delayUnit);
        if (step.delayUnit.toLowerCase() === "days") {
          const additionalHours = Math.floor(Math.random() * 4) + 1;
          const additionalMinutes = Math.floor(Math.random() * 60);
          delay += additionalHours * 60 + additionalMinutes;
          logDebugAndSave(
            `⏳ Added natural distribution of ${additionalHours}h ${additionalMinutes}m to day-based delay`
          );
        } else if (step.delayUnit.toLowerCase() === "hours") {
          const additionalMinutes = Math.floor(Math.random() * 26) + 5;
          delay += additionalMinutes;
          logDebugAndSave(
            `⏳ Added natural distribution of ${additionalMinutes}m to hour-based delay`
          );
        }
        logDebugAndSave("⏳ Calculated WAIT delay");
      }
      break;

    case StepTypeEnum.MANUAL_EMAIL:
    case StepTypeEnum.AUTOMATED_EMAIL:
      if (step.timing === TimingType.IMMEDIATE) {
        delay = 0;
        logDebugAndSave(
          "⚡ Immediate email - will be adjusted to next business hours if needed"
        );
      } else if (step.timing === TimingType.DELAY && step.delayAmount) {
        delay = convertToMinutes(step.delayAmount, step.delayUnit!);
        if (step.delayUnit?.toLowerCase() === "days") {
          const additionalHours = Math.floor(Math.random() * 3) + 1;
          const additionalMinutes = Math.floor(Math.random() * 60);
          delay += additionalHours * 60 + additionalMinutes;
          logDebugAndSave(
            `⏳ Added natural distribution of ${additionalHours}h ${additionalMinutes}m to day-based delay`
          );
        } else if (step.delayUnit?.toLowerCase() === "hours") {
          const additionalMinutes = Math.floor(Math.random() * 26) + 5;
          delay += additionalMinutes;
          logDebugAndSave(
            `⏳ Added natural distribution of ${additionalMinutes}m to hour-based delay`
          );
        }
        logDebugAndSave("⏰ Using specified delay with natural distribution");
      } else {
        delay = RATE_LIMIT_CONFIG.SCHEDULING.DEFAULT_DELAY;
        logDebugAndSave("⚠️ No timing specified, using default delay");
      }
      break;

    default:
      delay = RATE_LIMIT_CONFIG.SCHEDULING.DEFAULT_DELAY;
      logDebugAndSave("⚠️ Unknown step type, using default delay");
  }

  if (delay > RATE_LIMIT_CONFIG.SCHEDULING.DEFAULT_DELAY) {
    delay = Math.max(delay, RATE_LIMIT_CONFIG.SCHEDULING.MIN_DELAY);
    logAndSave("📊 Applied minimum delay threshold");
  } else {
    logAndSave("📊 Using exact delay");
  }

  if (isDemoMode) {
    delay = Math.min(delay, 480);
    logAndSave("🎮 Demo mode delay adjustment");
  }

  logAndSave(`✅ Final base delay calculated: ${delay} minutes`);
  return delay;
};

// Time conversion utility
export const convertToMinutes = (amount: number, unit: string): number => {
  switch (unit.toLowerCase()) {
    case "minutes":
      return amount;
    case "hours":
      return amount * 60;
    case "days":
      return amount * 24 * 60;
    default:
      return amount;
  }
};
