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

interface SequenceSetupChecklistProps {
  sequence: Sequence;
  className?: string;
}

export function SequenceSetupChecklist({
  sequence,
  className,
}: SequenceSetupChecklistProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [progressValue, setProgressValue] = useState(0);

  // Get sequence setup status
  const { steps, isReady } = isSequenceReadyToLaunch(sequence);
  const { completedSteps, totalSteps, completionPercentage } =
    getSequenceSetupProgress(sequence);

  // Animate progress bar
  useEffect(() => {
    const timer = setTimeout(() => {
      setProgressValue(completionPercentage);
    }, 100);
    return () => clearTimeout(timer);
  }, [completionPercentage]);

  return (
    <Card
      className={cn(
        "w-full border  shadow-sm transition-all duration-300",
        className,
        {
          "border-primary/20 bg-slate-50/50": !isReady,
          "border-green-500/30": isReady,
        }
      )}
    >
      <CardHeader className="pb-3 space-y-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isReady ? (
              <div className="h-8 w-8 rounded-full bg-green-50 flex items-center justify-center">
                <CheckCheck className="h-4 w-4 text-green-500" />
              </div>
            ) : (
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <AlertCircle className="h-4 w-4 text-primary" />
              </div>
            )}
            <div>
              <CardTitle className="text-lg">Sequence Setup</CardTitle>
              <CardDescription>
                {isReady
                  ? "All setup steps completed!"
                  : `${completionPercentage}% complete - ${totalSteps - completedSteps} ${totalSteps - completedSteps === 1 ? "step" : "steps"} remaining`}
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isReady && (
              <Badge
                variant="outline"
                className="bg-green-50 text-green-700 border-green-200 flex items-center gap-1 px-3 py-1"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Ready to Launch
              </Badge>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 ml-2"
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

        {isExpanded && (
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {completedSteps}/{totalSteps} steps completed
              </span>
              <span className="text-xs font-medium">
                {completionPercentage}%
              </span>
            </div>
            <Progress
              value={progressValue}
              className={cn("h-2", {
                "bg-primary/20": !isReady,
                "bg-green-100": isReady,
              })}
            />
          </div>
        )}
      </CardHeader>

      {isExpanded && (
        <>
          <CardContent className="pt-0">
            <div className="space-y-3 mt-3">
              <ChecklistItem
                icon={Mail}
                title="Add Sequence Steps"
                description="Create steps to define your sequence flow"
                isCompleted={steps.hasSteps}
                href={`/sequences/${sequence.id}`} // Point to overview page
              />

              <ChecklistItem
                icon={Users}
                title="Add Contacts"
                description="Add contacts to your sequence"
                isCompleted={steps.hasContacts}
                href={`/sequences/${sequence.id}/contacts`}
              />

              <ChecklistItem
                icon={Clock}
                title="Set Business Hours"
                description="Configure when your emails will be sent"
                isCompleted={steps.hasBusinessHours}
                href={`/sequences/${sequence.id}/settings`}
              />

              <ChecklistItem
                icon={Calendar}
                title="Attach Mailbox"
                description="Connect a mailbox to send your emails"
                isCompleted={steps.hasMailbox}
                href={`/sequences/${sequence.id}/settings`}
              />
            </div>
          </CardContent>

          <CardFooter
            className={cn("pt-0", {
              hidden: !isReady && completedSteps === 0,
            })}
          >
            {!isReady && completedSteps > 0 && (
              <div className="w-full p-3 bg-muted rounded-md text-sm text-center mt-3">
                <p className="text-muted-foreground">
                  Complete all steps above to enable the Launch button
                </p>
              </div>
            )}

            {isReady && (
              <Button className="w-full gap-2 mt-3" asChild>
                <a href={`/sequences/${sequence.id}`}>
                  Go to Overview to Launch
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            )}
          </CardFooter>
        </>
      )}
    </Card>
  );
}

interface ChecklistItemProps {
  icon: React.ElementType;
  title: string;
  description: string;
  isCompleted: boolean;
  href: string;
}

function ChecklistItem({
  icon: Icon,
  title,
  description,
  isCompleted,
  href,
}: ChecklistItemProps) {
  return (
    <div
      className={cn(
        "flex items-start space-x-3 p-3 rounded-md transition-all",
        {
          "bg-green-50 border border-green-100": isCompleted,
          "hover:bg-muted/50 border border-transparent": !isCompleted,
        }
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center",
          {
            "bg-green-100": isCompleted,
            "bg-muted": !isCompleted,
          }
        )}
      >
        <Icon
          className={cn("h-5 w-5", {
            "text-green-600": isCompleted,
            "text-muted-foreground": !isCompleted,
          })}
        />
      </div>

      <div className="space-y-1 flex-1">
        <div className="flex items-center justify-between">
          <h4
            className={cn("text-sm font-medium", {
              "text-green-700": isCompleted,
            })}
          >
            {title}
          </h4>
          {!isCompleted && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 gap-1 text-xs"
              asChild
            >
              <a href={href}>
                Setup
                <ArrowRight className="h-3 w-3 ml-1" />
              </a>
            </Button>
          )}
        </div>
        <p
          className={cn("text-xs", {
            "text-green-600": isCompleted,
            "text-muted-foreground": !isCompleted,
          })}
        >
          {description}
        </p>
      </div>
    </div>
  );
}
