import * as React from "react";
import { Clock } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover";
import { Button } from "./button";
import { cn } from "../lib/utils";
import { ScrollArea } from "./scroll-area";

interface TimePickerProps {
  value: string;
  onChange: (time: string) => void;
  disabled?: boolean;
}

function generateTimeOptions() {
  const options: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const formattedHour = hour.toString().padStart(2, "0");
      const formattedMinute = minute.toString().padStart(2, "0");
      options.push(`${formattedHour}:${formattedMinute}`);
    }
  }
  return options;
}

export function TimePicker({ value, onChange, disabled }: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const timeOptions = React.useMemo(() => generateTimeOptions(), []);

  const formattedValue = value || "00:00";
  const [hours, minutes] = formattedValue.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  const formatTimeForDisplay = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    const isPM = h >= 12;
    const displayH = h % 12 || 12;
    return `${displayH}:${m.toString().padStart(2, "0")} ${isPM ? "PM" : "AM"}`;
  };

  const handleTimeSelect = (time: string) => {
    onChange(time);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-[140px] justify-start text-left font-normal",
            !value && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <Clock className="mr-2 h-4 w-4" />
          {formattedValue ? (
            <span>
              {displayHours}:{minutes.toString().padStart(2, "0")} {period}
            </span>
          ) : (
            <span>Pick a time</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <ScrollArea className="h-[280px]">
          <div className="p-2">
            {timeOptions.map((time) => (
              <Button
                key={time}
                variant={time === value ? "default" : "ghost"}
                className={cn(
                  "w-full justify-start font-normal mb-1",
                  time === value && "bg-primary text-primary-foreground"
                )}
                onClick={() => handleTimeSelect(time)}
              >
                {formatTimeForDisplay(time)}
              </Button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
