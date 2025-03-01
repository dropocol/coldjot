"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  CheckCircle2,
  Circle,
  Clock,
  Mail,
  Users,
  Calendar,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowRight,
  AlertCircle,
  CheckCheck,
  PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Sequence } from "@coldjot/types";
import {
  isSequenceReadyToLaunch,
  getSequenceSetupProgress,
} from "@/lib/sequence-utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useSequence } from "@/lib/sequence-context";
import { motion, AnimatePresence } from "framer-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SequenceSetupChecklistProps {
  sequence?: Sequence;
  onStepComplete?: () => void;
  className?: string;
  onLaunch?: () => void;
}

export function SequenceSetupChecklist({
  sequence: sequenceProp,
  onStepComplete,
  className,
  onLaunch,
}: SequenceSetupChecklistProps) {
  // Use context if no prop is provided
  const context = useSequence();
  const sequence = sequenceProp || context.sequence;
  const handleStepComplete = onStepComplete || context.refreshSequence;

  const [isExpanded, setIsExpanded] = useState(true);
  const [progressValue, setProgressValue] = useState(0);

  // Get sequence setup status
  const { steps, isReady } = isSequenceReadyToLaunch(sequence);

  // Fix the step counting issue by explicitly defining the total steps
  // instead of relying on metadata which might include lastUpdated
  const totalRequiredSteps = 4; // Explicitly set to 4 required steps

  const { completedSteps, completionPercentage } =
    getSequenceSetupProgress(sequence);

  // Calculate the actual completed steps (capped at totalRequiredSteps)
  const actualCompletedSteps = Math.min(completedSteps, totalRequiredSteps);

  // Recalculate the completion percentage
  const actualCompletionPercentage = Math.round(
    (actualCompletedSteps / totalRequiredSteps) * 100
  );

  // Animate progress bar
  useEffect(() => {
    const timer = setTimeout(() => {
      setProgressValue(actualCompletionPercentage);
    }, 100);
    return () => clearTimeout(timer);
  }, [actualCompletionPercentage]);

  return (
    <Card
      className={cn(
        "w-full shadow-2xl shadow-slate-900/20 border transition-all duration-300",
        className,
        {
          "border-primary/20 bg-slate-50/50": !isReady,
          "border-emerald-500/50": isReady,
        }
      )}
    >
      <CardHeader className={cn("pt-4 px-4 pb-4")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isReady ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center"
              >
                <CheckCheck className="h-4 w-4 text-emerald-500" />
              </motion.div>
            ) : (
              <div className="h-8 w-8 rounded-full bg-amber-50 flex items-center justify-center">
                <AlertCircle className="h-4 w-4 text-amber-500" />
              </div>
            )}
            <div>
              <CardTitle className="text-base">Sequence Setup</CardTitle>
              <CardDescription className="text-xs">
                {isReady
                  ? "All setup steps completed!"
                  : `${actualCompletionPercentage}% complete - ${totalRequiredSteps - actualCompletedSteps} ${
                      totalRequiredSteps - actualCompletedSteps === 1
                        ? "step"
                        : "steps"
                    } remaining`}
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isReady && (
              <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1 px-3 py-1"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Ready to Launch
                </Badge>
              </motion.div>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <CardContent className="pt-0 px-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <ChecklistCard
                  icon={Mail}
                  title="Add Sequence Steps"
                  description="Create steps to define your sequence flow"
                  isCompleted={steps.hasSteps}
                  href={`/sequences/${sequence.id}`}
                  onStepComplete={handleStepComplete}
                />

                <ChecklistCard
                  icon={Users}
                  title="Add Contacts"
                  description="Add contacts to your sequence"
                  isCompleted={steps.hasContacts}
                  href={`/sequences/${sequence.id}/contacts`}
                  onStepComplete={handleStepComplete}
                />

                <ChecklistCard
                  icon={Clock}
                  title="Set Business Hours"
                  description="Configure when your emails will be sent"
                  isCompleted={steps.hasBusinessHours}
                  href={`/sequences/${sequence.id}/settings`}
                  onStepComplete={handleStepComplete}
                />

                <ChecklistCard
                  icon={Calendar}
                  title="Attach Mailbox"
                  description="Connect a mailbox to send your emails"
                  isCompleted={steps.hasMailbox}
                  href={`/sequences/${sequence.id}/settings`}
                  onStepComplete={handleStepComplete}
                />
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

interface ChecklistCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  isCompleted: boolean;
  href: string;
  onStepComplete?: () => void;
}

function ChecklistCard({
  icon: Icon,
  title,
  description,
  isCompleted,
  href,
  onStepComplete,
}: ChecklistCardProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (onStepComplete) {
      e.preventDefault();
      onStepComplete();
      // Navigate after a short delay to allow the metadata to update
      setTimeout(() => {
        window.location.href = href;
      }, 100);
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "flex flex-col p-3 rounded-md transition-all cursor-pointer",
        {
          "bg-emerald-50/50 border border-emerald-200": isCompleted,
          "bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm":
            !isCompleted,
        }
      )}
      onClick={(e) => {
        if (!isCompleted) {
          handleClick(e);
        }
      }}
    >
      <div className="flex items-start space-x-3">
        <div
          className={cn(
            "flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center",
            {
              "bg-emerald-100": isCompleted,
              "bg-slate-100": !isCompleted,
            }
          )}
        >
          <Icon
            className={cn("h-5 w-5", {
              "text-emerald-600": isCompleted,
              "text-slate-500": !isCompleted,
            })}
          />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <h4
              className={cn("text-sm font-medium", {
                "text-emerald-800": isCompleted,
              })}
            >
              {title}
            </h4>
          </div>
          <p
            className={cn("text-xs", {
              "text-emerald-700": isCompleted,
              "text-muted-foreground": !isCompleted,
            })}
          >
            {isCompleted ? (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="flex items-center"
              >
                <CheckCircle2 className="inline-block h-3 w-3 mr-1" />
                {description}
              </motion.span>
            ) : (
              <span className="flex items-center">
                <Circle className="inline-block h-3 w-3 mr-1" />
                {description}
              </span>
            )}
          </p>
        </div>
      </div>

      {!isCompleted && (
        <div className="mt-2 self-end">
          <Button variant="outline" className="h-7 px-3 gap-1 text-xs" asChild>
            <a href={href} onClick={handleClick}>
              Setup
              <ArrowRight className="h-3 w-3 ml-1" />
            </a>
          </Button>
        </div>
      )}
    </motion.div>
  );
}
