import type { BusinessHours } from "@coldjot/types";
import { BusinessScheduleEnum } from "@coldjot/types";

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: "UTC",
  workDays: [1, 2, 3, 4, 5], // Monday to Friday
  workHoursStart: "09:00",
  workHoursEnd: "17:00",
  type: BusinessScheduleEnum.BUSINESS,
} as const;
