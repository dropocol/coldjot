"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@coldjot/ui/components/button";
import { Calendar } from "@coldjot/ui/components/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@coldjot/ui/components/popover";
import { cn } from "@coldjot/ui/lib/utils";
import { format } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Badge } from "@coldjot/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@coldjot/ui/components/select";

export function TimelineFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [date, setDate] = useState<Date>();

  const currentStatus = searchParams.get("status") || "all";

  const createQueryString = (params: Record<string, string | null>) => {
    const newSearchParams = new URLSearchParams(searchParams.toString());

    Object.entries(params).forEach(([key, value]) => {
      if (value === null) {
        newSearchParams.delete(key);
      } else {
        newSearchParams.set(key, value);
      }
    });

    return newSearchParams.toString();
  };

  const handleDateSelect = (date: Date | undefined) => {
    setDate(date);

    if (date) {
      const formattedDate = format(date, "yyyy-MM-dd");
      router.push(`${pathname}?${createQueryString({ date: formattedDate })}`);
    } else {
      router.push(`${pathname}?${createQueryString({ date: null })}`);
    }
  };

  const handleStatusChange = (status: string) => {
    if (status === "all") {
      router.push(`${pathname}?${createQueryString({ status: null })}`);
    } else {
      router.push(`${pathname}?${createQueryString({ status })}`);
    }
  };

  const clearFilters = () => {
    setDate(undefined);
    router.push(pathname);
  };

  const hasFilters = searchParams.toString().length > 0;

  // TODO: Confirm if these filters are working
  return (
    <div className="flex items-center gap-2">
      <Select value={currentStatus} onValueChange={(v) => handleStatusChange(v as string)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Filter by status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Emails</SelectItem>
          <SelectItem value="sent">Sent</SelectItem>
          <SelectItem value="opened">Opened</SelectItem>
          <SelectItem value="clicked">Clicked</SelectItem>
          <SelectItem value="replied">Replied</SelectItem>
          <SelectItem value="bounced">Bounced</SelectItem>
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className={cn(
                "w-[240px] justify-start text-left font-normal",
                !date && "text-muted-foreground"
              )}
            />
          }
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP") : "Filter by date"}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={date} onSelect={handleDateSelect} />
        </PopoverContent>
      </Popover>

      {hasFilters && (
        <Button variant="ghost" className="gap-2" onClick={clearFilters}>
          <X className="h-4 w-4" />
          Clear filters
        </Button>
      )}

      {hasFilters && (
        <div className="ml-4 flex items-center gap-2">
          {currentStatus !== "all" && <Badge variant="secondary">Status: {currentStatus}</Badge>}
          {date && <Badge variant="secondary">Date: {format(date, "MMM d, yyyy")}</Badge>}
        </div>
      )}
    </div>
  );
}
