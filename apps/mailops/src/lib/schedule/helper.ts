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

// -------------------------------------------
// -------------------------------------------
// -------------------------------------------

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

// -------------------------------------------
// -------------------------------------------
// -------------------------------------------

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

// -------------------------------------------
// -------------------------------------------
// -------------------------------------------

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

// -------------------------------------------
// -------------------------------------------
// -------------------------------------------

// Unified distribution logic
export const calculateDistribution = (
  businessHours?: BusinessHours,
  delayUnit?: string,
  isBusinessHoursAdjustment: boolean = false,
  isImmediate: boolean = false
): { minutes: number; seconds: number; milliseconds: number } => {
  logDebugAndSave(`
    🎯 Starting Distribution Calculation:
    - Is Business Hours Adjustment: ${isBusinessHoursAdjustment}
    - Has Business Hours: ${!!businessHours}
    - Delay Unit: ${delayUnit || "N/A"}
    - Is Immediate: ${isImmediate}
  `);

  // For immediate timing, add a small base distribution
  if (isImmediate) {
    const minutes = Math.floor(Math.random() * 31); // 0-30 minutes
    const seconds = Math.floor(Math.random() * 60);
    const milliseconds = Math.floor(Math.random() * 1000);

    logDebugAndSave(`
      ⚡ Immediate Timing Distribution:
      - Base Minutes: ${minutes}
      - Seconds: ${seconds}
      - Milliseconds: ${milliseconds}
    `);

    return { minutes, seconds, milliseconds };
  }

  // For business hours adjustment
  if (isBusinessHoursAdjustment && businessHours) {
    const [startHour, startMinute] = businessHours.workHoursStart
      .split(":")
      .map(Number);
    const [endHour, endMinute] = businessHours.workHoursEnd
      .split(":")
      .map(Number);

    const businessDayMinutes =
      endHour * 60 + endMinute - (startHour * 60 + startMinute);
    const bufferMinutes = 60; // 1-hour buffer
    const safeStartMinutes = bufferMinutes;
    const safeEndMinutes = businessDayMinutes - bufferMinutes;

    const distributionMinutes =
      Math.floor(Math.random() * (safeEndMinutes - safeStartMinutes)) +
      safeStartMinutes;
    const seconds = Math.floor(Math.random() * 60);
    const milliseconds = Math.floor(Math.random() * 1000);

    logDebugAndSave(`
      🎲 Business Hours Distribution Calculation:
      - Business Day Start: ${startHour}:${startMinute}
      - Business Day End: ${endHour}:${endMinute}
      - Total Business Minutes: ${businessDayMinutes}
      - Buffer Minutes: ${bufferMinutes}
      - Safe Window: ${safeStartMinutes}-${safeEndMinutes} minutes
      - Calculated Distribution:
        * Minutes: ${distributionMinutes}
        * Seconds: ${seconds}
        * Milliseconds: ${milliseconds}
    `);

    return { minutes: distributionMinutes, seconds, milliseconds };
  }

  // For delay-based distribution
  if (delayUnit) {
    let minutes = 0;
    const seconds = Math.floor(Math.random() * 60);
    const milliseconds = Math.floor(Math.random() * 1000);

    if (delayUnit.toLowerCase() === "days") {
      const additionalHours = Math.floor(Math.random() * 2) + 1; // 1-2 hours
      const additionalMinutes = Math.floor(Math.random() * 60); // 0-59 minutes
      minutes = additionalHours * 60 + additionalMinutes;

      logDebugAndSave(`
        ⏳ Day-Based Delay Distribution:
        - Additional Hours: ${additionalHours}
        - Additional Minutes: ${additionalMinutes}
        - Total Minutes: ${minutes}
        - Seconds: ${seconds}
        - Milliseconds: ${milliseconds}
      `);
    } else if (delayUnit.toLowerCase() === "hours") {
      minutes = Math.floor(Math.random() * 26) + 5; // 5-30 minutes

      logDebugAndSave(`
        ⏳ Hour-Based Delay Distribution:
        - Additional Minutes: ${minutes}
        - Seconds: ${seconds}
        - Milliseconds: ${milliseconds}
      `);
    }

    return { minutes, seconds, milliseconds };
  }

  // Default minimal distribution
  const defaultDistribution = {
    minutes: Math.floor(Math.random() * 31), // Changed to add 0-30 minutes by default
    seconds: Math.floor(Math.random() * 60),
    milliseconds: Math.floor(Math.random() * 1000),
  };

  logDebugAndSave(`
    ⚡ Default Distribution:
    - Minutes: ${defaultDistribution.minutes}
    - Seconds: ${defaultDistribution.seconds}
    - Milliseconds: ${defaultDistribution.milliseconds}
  `);

  return defaultDistribution;
};

// -------------------------------------------
// -------------------------------------------
// -------------------------------------------

// Helper for natural distribution
const addNaturalDistribution = (delayUnit: string): number => {
  logDebugAndSave(`
    🔄 Starting Natural Distribution:
    - Delay Unit: ${delayUnit}
  `);

  const distribution = calculateDistribution(undefined, delayUnit, false);

  logDebugAndSave(`
    ✅ Natural Distribution Result:
    - Added Minutes: ${distribution.minutes}
  `);

  return distribution.minutes;
};

// -------------------------------------------
// -------------------------------------------
// -------------------------------------------

export const calculateBaseDelay = (
  step: SequenceStep,
  isDemoMode: boolean
): number => {
  logDebugAndSave(`
    ⌛ Starting Base Delay Calculation:
    - Step Type: ${step.stepType}
    - Timing: ${step.timing}
    - Delay Amount: ${step.delayAmount || "N/A"}
    - Delay Unit: ${step.delayUnit || "N/A"}
    - Demo Mode: ${isDemoMode}
  `);

  let delay: number;

  if (step.timing === TimingType.IMMEDIATE) {
    logDebugAndSave("⚡ Immediate timing - no delay needed");
    return 0;
  }

  if (
    step.delayAmount &&
    step.delayUnit &&
    (step.timing === TimingType.DELAY || step.stepType === StepTypeEnum.WAIT)
  ) {
    delay = convertToMinutes(step.delayAmount, step.delayUnit);
    logDebugAndSave(`📊 Base delay before distribution: ${delay} minutes`);

    const naturalDistribution = addNaturalDistribution(step.delayUnit);
    delay += naturalDistribution;

    const actionType = step.stepType === StepTypeEnum.WAIT ? "WAIT" : "EMAIL";
    logDebugAndSave(`
      ⏳ Delay Calculation Complete:
      - Action Type: ${actionType}
      - Base Delay: ${delay - naturalDistribution} minutes
      - Added Distribution: ${naturalDistribution} minutes
      - Final Delay: ${delay} minutes
    `);
  } else {
    delay = RATE_LIMIT_CONFIG.SCHEDULING.DEFAULT_DELAY;
    logDebugAndSave(`⚠️ Using default delay: ${delay} minutes`);
  }

  if (delay > RATE_LIMIT_CONFIG.SCHEDULING.DEFAULT_DELAY) {
    const originalDelay = delay;
    delay = Math.max(delay, RATE_LIMIT_CONFIG.SCHEDULING.MIN_DELAY);
    logDebugAndSave(`
      📊 Applied Minimum Delay Threshold:
      - Original: ${originalDelay} minutes
      - After Threshold: ${delay} minutes
    `);
  }

  if (isDemoMode) {
    const originalDelay = delay;
    delay = Math.min(delay, 480);
    logDebugAndSave(`
      🎮 Demo Mode Adjustment:
      - Original: ${originalDelay} minutes
      - After Cap: ${delay} minutes
    `);
  }

  logDebugAndSave(`✅ Final base delay: ${delay} minutes`);
  return delay;
};

// -------------------------------------------
// -------------------------------------------
// -------------------------------------------

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
