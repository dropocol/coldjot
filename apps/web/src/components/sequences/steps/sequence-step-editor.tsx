"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Mail } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { format } from "date-fns";

type DelayUnit = "minutes" | "hours" | "days";

interface StepFormData {
  type: string;
  timing: "immediate" | "delay";
  priority: "high" | "medium" | "low";
  delayAmount?: number;
  delayUnit?: DelayUnit;
  note?: string;
}

interface SequenceStepEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  initialData?: {
    timing?: "immediate" | "delay";
    priority?: "high" | "medium" | "low";
    delayAmount?: number;
    delayUnit?: DelayUnit;
    note?: string;
  };
}

export function SequenceStepEditor({
  open,
  onClose,
  onSave,
  initialData,
}: SequenceStepEditorProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit, watch, control, reset } =
    useForm<StepFormData>({
      defaultValues: {
        type: "manual_email",
        timing: initialData?.timing || "immediate",
        priority: initialData?.priority || "medium",
        delayAmount: initialData?.delayAmount || 30,
        delayUnit: initialData?.delayUnit || "minutes",
        note: initialData?.note || "",
      },
    });

  // Reset form when initialData changes
  useEffect(() => {
    if (initialData) {
      reset({
        type: "manual_email",
        timing: initialData.timing || "immediate",
        priority: initialData.priority || "medium",
        delayAmount: initialData.delayAmount || 30,
        delayUnit: initialData.delayUnit || "minutes",
        note: initialData.note || "",
      });
    }
  }, [initialData, reset]);

  const timing = watch("timing");
  const delayAmount = watch("delayAmount");
  const delayUnit = watch("delayUnit");

  const onSubmit = async (data: StepFormData) => {
    setIsSubmitting(true);
    try {
      const formattedData = {
        type: "manual_email",
        timing: data.timing,
        priority: data.priority,
        ...(data.timing === "delay" && {
          delayAmount: Number(data.delayAmount),
          delayUnit: data.delayUnit,
        }),
        note: data.note,
      };

      onSave(formattedData);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[600px] sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle>
            {initialData ? "Edit Sequence Step" : "Add Sequence Step"}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-6">
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <Mail className="h-6 w-6 text-primary" />
              <div>
                <h3 className="font-medium">Manual email</h3>
                <p className="text-sm text-muted-foreground">
                  Task is created to edit and deliver email.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <Label>When to start this step:</Label>
              <Controller
                name="timing"
                control={control}
                render={({ field }) => (
                  <RadioGroup
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="immediate" id="immediate" />
                      <Label htmlFor="immediate">
                        Immediately after the previous step is completed
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="delay" id="delay" />
                      <Label htmlFor="delay">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            className="w-20"
                            {...register("delayAmount", {
                              valueAsNumber: true,
                              min: 1,
                            })}
                            disabled={timing !== "delay"}
                          />
                          <Controller
                            name="delayUnit"
                            control={control}
                            render={({ field }) => (
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value as DelayUnit}
                                disabled={timing !== "delay"}
                              >
                                <SelectTrigger className="w-[120px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="minutes">
                                    minutes
                                  </SelectItem>
                                  <SelectItem value="hours">hours</SelectItem>
                                  <SelectItem value="days">days</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                          <span>after the previous step</span>
                        </div>
                      </Label>
                    </div>
                  </RadioGroup>
                )}
              />

              {timing === "delay" && delayAmount && delayUnit && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <h4 className="text-sm font-medium mb-2">
                    Estimated Next Send Time
                  </h4>
                  <div className="text-sm text-muted-foreground"></div>
                  <p className="text-xs text-muted-foreground mt-2">
                    * Actual send time may vary based on business hours and
                    holidays
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <Label>Assign task priority</Label>
              <Controller
                name="priority"
                control={control}
                render={({ field }) => (
                  <RadioGroup
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="high" id="high" />
                        <Label htmlFor="high">High priority</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="medium" id="medium" />
                        <Label htmlFor="medium">Medium priority</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="low" id="low" />
                        <Label htmlFor="low">Low priority</Label>
                      </div>
                    </div>
                  </RadioGroup>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Add note</Label>
              <Textarea
                {...register("note")}
                placeholder="Add a description, purpose or goal for the task"
                className="min-h-[100px]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Back
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
