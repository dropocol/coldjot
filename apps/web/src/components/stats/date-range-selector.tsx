"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@coldjot/ui";

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

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select time range" />
      </SelectTrigger>
      <SelectContent>
        {DATE_RANGE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
