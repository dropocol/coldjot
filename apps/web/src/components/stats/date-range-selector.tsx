"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@coldjot/ui/components/select";

export type DateRange =
  | "today"
  | "this_week"
  | "last_7_days"
  | "last_30_days"
  | "all_time";

interface DateRangeSelectorProps {
  value: DateRange;
  onChange: (value: DateRange) => void;
}

const DATE_RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "all_time", label: "All Time" },
] as const;

const LABEL_BY_VALUE = Object.fromEntries(
  DATE_RANGE_OPTIONS.map((o) => [o.value, o.label])
) as Record<DateRange, string>;

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DateRange)}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select time range">
          {(val: string | null) =>
            val ? (LABEL_BY_VALUE[val as DateRange] ?? val) : "Select time range"
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent side="bottom" alignItemWithTrigger={false} className="p-1">
        {DATE_RANGE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
