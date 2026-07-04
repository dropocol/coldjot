"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { DateRangeSelector } from "./date-range-selector";
import type { DateRange } from "@coldjot/types";

export function DateRangeSelectorWrapper() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentRange = (searchParams.get("range") ||
    "last_30_days") as DateRange;

  const handleChange = (value: DateRange) => {
    const params = new URLSearchParams(searchParams);
    params.set("range", value);
    router.push(`/?${params.toString()}`);
  };

  return <DateRangeSelector value={currentRange} onChange={handleChange} />;
}
