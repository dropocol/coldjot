import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Clock } from "lucide-react";
import { TimePicker } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";
import { toast } from "react-hot-toast";

interface BusinessHoursStepProps {
  onNext: () => void;
  onBack: () => void;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export function BusinessHoursStep({ onNext, onBack }: BusinessHoursStepProps) {
  const [settings, setSettings] = useState({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    workDays: [1, 2, 3, 4, 5], // Monday to Friday
    workHoursStart: "09:00",
    workHoursEnd: "17:00",
  });

  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleWorkDayToggle = (day: number) => {
    const newWorkDays = settings.workDays.includes(day)
      ? settings.workDays.filter((d) => d !== day)
      : [...settings.workDays, day].sort();

    setSettings({ ...settings, workDays: newWorkDays });
  };

  const handleTimeChange = (type: "start" | "end", value: string) => {
    setSettings({
      ...settings,
      [type === "start" ? "workHoursStart" : "workHoursEnd"]: value,
    });
  };

  const handleTimezoneChange = (value: string) => {
    setSettings({ ...settings, timezone: value });
    setOpen(false);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const response = await fetch("/api/business-hours", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timezone: settings.timezone,
          workDays: settings.workDays,
          workHoursStart: settings.workHoursStart,
          workHoursEnd: settings.workHoursEnd,
          type: "default",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save business hours");
      }

      toast.success("Business hours saved successfully");
      onNext();
    } catch (error) {
      console.error("Failed to save business hours:", error);
      toast.error("Failed to save business hours");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <Label>Timezone</Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-[300px] justify-between"
              >
                {settings.timezone}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search timezone..." />
                <CommandEmpty>No timezone found.</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-auto">
                  {Intl.supportedValuesOf("timeZone").map((zone) => (
                    <CommandItem
                      key={zone}
                      value={zone}
                      onSelect={handleTimezoneChange}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          settings.timezone === zone
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      {zone}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-8">
          <div>
            <Label className="mb-4 block">Active Days</Label>
            <div className="flex gap-2">
              {DAYS_OF_WEEK.map((day) => (
                <Button
                  key={day.value}
                  type="button"
                  variant={
                    settings.workDays.includes(day.value)
                      ? "default"
                      : "outline"
                  }
                  onClick={() => handleWorkDayToggle(day.value)}
                  className={cn(
                    "flex-1 min-w-[54px]",
                    settings.workDays.includes(day.value) &&
                      "bg-foreground text-primary-foreground"
                  )}
                >
                  {day.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <Label className="block">Active Hours</Label>
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <Label>Start Time</Label>
                  <TimePicker
                    value={settings.workHoursStart}
                    onChange={(value) => handleTimeChange("start", value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  When your workday typically begins
                </p>
              </div>
              <div className="flex flex-col justify-end items-end space-y-2">
                <div className="flex items-center gap-4">
                  <Label>End Time</Label>
                  <TimePicker
                    value={settings.workHoursEnd}
                    onChange={(value) => handleTimeChange("end", value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  When your workday typically ends
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-6">
        <Button variant="ghost" onClick={onNext}>
          I'll do this later
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Continue"}
        </Button>
      </div>
    </div>
  );
}
