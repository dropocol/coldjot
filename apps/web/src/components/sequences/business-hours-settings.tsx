import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "react-hot-toast";
import type { BusinessHours, BusinessScheduleType } from "@coldjot/types";
import { TimePicker } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";
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
import { BusinessScheduleEnum } from "@coldjot/types";
import { updateBusinessHours } from "@/lib/client-actions";
import { useSequence } from "@/lib/sequence-context";

interface BusinessHoursSettingsProps {
  sequenceId: string;
  initialSettings?: BusinessHours;
  scheduleType: BusinessScheduleEnum;
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

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  workDays: [1, 2, 3, 4, 5], // Monday to Friday
  workHoursStart: "09:00",
  workHoursEnd: "17:00",
  type: BusinessScheduleEnum.BUSINESS,
};

export function BusinessHoursSettings({
  sequenceId,
  initialSettings,
  scheduleType: initialScheduleType,
}: BusinessHoursSettingsProps) {
  // Initialize settings with defaults and ensure workDays is always an array
  const [settings, setSettings] = useState<BusinessHours>({
    ...(initialSettings || DEFAULT_BUSINESS_HOURS),
    workDays: initialSettings?.workDays || DEFAULT_BUSINESS_HOURS.workDays,
  });

  const [scheduleType, setScheduleType] =
    useState<BusinessScheduleType>(initialScheduleType);

  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { updateReadinessField } = useSequence();

  const handleWorkDayToggle = (day: number) => {
    // Ensure workDays is an array before using includes
    const currentWorkDays = settings.workDays || [];

    const newWorkDays = currentWorkDays.includes(day)
      ? currentWorkDays.filter((d) => d !== day)
      : [...currentWorkDays, day].sort();

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

  const handleScheduleTypeChange = (value: BusinessScheduleType) => {
    console.log("handleScheduleTypeChange", value);
    setScheduleType(value);

    // Ensure workDays is always an array when changing schedule type
    setSettings({
      ...(initialSettings || DEFAULT_BUSINESS_HOURS),
      type: value,
      // Ensure workDays is always an array
      workDays: initialSettings?.workDays || DEFAULT_BUSINESS_HOURS.workDays,
    });
  };

  const handleSaveSettings = async () => {
    try {
      setIsLoading(true);

      // Prepare the data based on schedule type
      const businessHoursData = {
        scheduleType,
        // Include necessary fields for both schedule types
        timezone: settings.timezone || DEFAULT_BUSINESS_HOURS.timezone,
        workDays: settings.workDays || DEFAULT_BUSINESS_HOURS.workDays,
        workHoursStart:
          settings.workHoursStart || DEFAULT_BUSINESS_HOURS.workHoursStart,
        workHoursEnd:
          settings.workHoursEnd || DEFAULT_BUSINESS_HOURS.workHoursEnd,
      };

      console.log("Saving business hours:", businessHoursData);

      // Use the client action instead of direct fetch
      const result = await updateBusinessHours(
        sequenceId,
        businessHoursData,
        updateReadinessField
      );

      // Update local state with the response
      if (result) {
        setSettings({
          ...settings,
          ...result,
          // Ensure workDays is always an array
          workDays: result.workDays || [],
        });
      }

      toast.success("Settings saved successfully");
    } catch (error) {
      console.error("Error updating business hours:", error);
      toast.error("Failed to save settings");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="border-b pb-3">
        <h3 className="text-lg font-semibold">Business Hours</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Configure when your sequence should be active. This helps ensure
          emails are sent at appropriate times.
        </p>
      </div>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Label>Schedule Type</Label>
            <p className="mt-2 text-sm text-muted-foreground">
              {scheduleType === "business"
                ? "Emails will be sent during business hours only"
                : "Emails will be sent according to custom schedule"}
            </p>
          </div>
          <Select
            value={scheduleType}
            onValueChange={handleScheduleTypeChange}
            disabled={isLoading}
          >
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Select schedule type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="business">Business Hours</SelectItem>
              <SelectItem value="custom">Custom Schedule</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <Label>Timezone</Label>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild className="max-w-md">
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className="w-full justify-between"
                  disabled={isLoading}
                >
                  {settings.timezone || DEFAULT_BUSINESS_HOURS.timezone}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
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

          <div className="flex items-center justify-between">
            <div>
              <Label className="mb-2 block">Active Days</Label>
              <p className="mt-2 text-sm text-muted-foreground">
                Select the days when emails can be sent
              </p>
            </div>
            <div className="flex gap-2 max-w-md">
              {DAYS_OF_WEEK.map((day) => {
                // Ensure workDays is an array before checking includes
                const workDays = settings.workDays || [];
                return (
                  <Button
                    key={day.value}
                    type="button"
                    variant={
                      workDays.includes(day.value) ? "default" : "outline"
                    }
                    onClick={() => handleWorkDayToggle(day.value)}
                    disabled={isLoading}
                    className={cn(
                      "flex-1 min-w-[54px] shadow-none",
                      workDays.includes(day.value) &&
                        "bg-foreground text-primary-foreground"
                    )}
                  >
                    {day.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="mb-2 block">Active Hours</Label>
              <p className="mt-2 text-sm text-muted-foreground">
                Select the hours when emails can be sent
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex flex-row items-center gap-2">
                  <Label>Start Time</Label>
                  <TimePicker
                    value={
                      settings.workHoursStart ||
                      DEFAULT_BUSINESS_HOURS.workHoursStart
                    }
                    onChange={(value) => handleTimeChange("start", value)}
                    disabled={isLoading}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {scheduleType === "business"
                    ? "Fixed to business hours"
                    : "Custom start time"}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-row items-center gap-2">
                  <Label>End Time</Label>
                  <TimePicker
                    value={
                      settings.workHoursEnd ||
                      DEFAULT_BUSINESS_HOURS.workHoursEnd
                    }
                    onChange={(value) => handleTimeChange("end", value)}
                    disabled={isLoading}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {scheduleType === "business"
                    ? "Fixed to business hours"
                    : "Custom end time"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button
            variant="secondary"
            onClick={handleSaveSettings}
            disabled={isLoading}
          >
            {isLoading ? "Saving..." : "Save Schedule Settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
