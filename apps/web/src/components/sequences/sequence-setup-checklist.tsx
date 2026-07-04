"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@coldjot/ui/components/card";
import {
  Check,
  ChevronDown,
  Clock,
  Mail,
  Users,
  Calendar,
  Sparkles,
  ArrowRight,
  AlertCircle,
  CheckCheck,
} from "lucide-react";
import { Button } from "@coldjot/ui/components/button";

import { cn } from "@coldjot/ui/lib/utils";
import { Sequence } from "@coldjot/types";
import {
  isSequenceReadyToLaunch,
} from "@/lib/sequence-utils";
import { Badge } from "@coldjot/ui/components/badge";

import { useSequence } from "@/lib/sequence-context";
import { motion, AnimatePresence } from "framer-motion";

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
  onLaunch: _onLaunch,
}: SequenceSetupChecklistProps) {
  // Use context if no prop is provided
  const context = useSequence();
  const sequence = sequenceProp || context.sequence;
  const handleStepComplete = onStepComplete || context.refreshSequence;

  const [isExpanded, setIsExpanded] = useState(true);
  const [animatedPercent, setAnimatedPercent] = useState(0);

  // Get sequence setup status
  const { steps, isReady } = isSequenceReadyToLaunch(sequence);

  const totalRequiredSteps = 4;

  const completedStepsList = [
    steps.hasSteps,
    steps.hasContacts,
    steps.hasBusinessHours,
    steps.hasMailbox,
  ];
  const actualCompletedSteps = Math.min(
    completedStepsList.filter(Boolean).length,
    totalRequiredSteps
  );
  const actualCompletionPercentage = Math.round(
    (actualCompletedSteps / totalRequiredSteps) * 100
  );
  const remaining = totalRequiredSteps - actualCompletedSteps;

  // Animate progress bar / number
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedPercent(actualCompletionPercentage);
    }, 120);
    return () => clearTimeout(timer);
  }, [actualCompletionPercentage]);

  return (
    <Card
      className={cn(
        "w-full border shadow-none ring-0 transition-colors duration-300",
        isReady
          ? "border-emerald-500/30 dark:border-emerald-400/25"
          : "border-border",
        className
      )}
    >
      <CardHeader className="gap-0 px-5 pt-0 pb-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.25 }}
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 transition-colors",
                isReady
                  ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20"
                  : "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20"
              )}
            >
              {isReady ? (
                <CheckCheck className="h-5 w-5" />
              ) : (
                <AlertCircle className="h-5 w-5" />
              )}
            </motion.div>
            <div className="space-y-0.5">
              <CardTitle className="text-base font-semibold tracking-tight">
                Sequence Setup
              </CardTitle>
              <CardDescription className="text-xs">
                {isReady ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    All set — ready to launch
                  </span>
                ) : (
                  <>
                    <span className="font-medium text-foreground">
                      {actualCompletionPercentage}%
                    </span>{" "}
                    complete &middot; {remaining} {remaining === 1 ? "step" : "steps"}{" "}
                    remaining
                  </>
                )}
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isReady && (
              <motion.div
                initial={{ x: 12, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.25 }}
              >
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Ready to Launch
                </Badge>
              </motion.div>
            )}

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? "Collapse setup" : "Expand setup"}
            >
              <motion.span
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="flex"
              >
                <ChevronDown className="h-4 w-4" />
              </motion.span>
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 flex items-center gap-3">
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <motion.div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full",
                isReady
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                  : "bg-gradient-to-r from-primary/70 to-primary"
              )}
              initial={{ width: 0 }}
              animate={{
                width: `${animatedPercent}%`,
              }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
          {/* Segmented dots */}
          <div className="hidden items-center gap-1.5 sm:flex">
            {completedStepsList.map((done, i) => (
              <motion.span
                key={i}
                initial={false}
                animate={{ scale: done ? 1 : 0.85 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  done
                    ? "bg-emerald-500 dark:bg-emerald-400"
                    : "bg-muted-foreground/30"
                )}
              />
            ))}
          </div>
        </div>
      </CardHeader>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden pt-1"
          >
            <CardContent className="grid grid-cols-1 gap-3 px-5 pb-4 sm:grid-cols-2 lg:grid-cols-4">
              <SetupStep
                step={1}
                icon={Mail}
                title="Add Steps"
                description="Define your email flow"
                isCompleted={steps.hasSteps}
                href={`/sequences/${sequence.id}`}
                onStepComplete={handleStepComplete}
              />
              <SetupStep
                step={2}
                icon={Users}
                title="Add Contacts"
                description="Pick who to enroll"
                isCompleted={steps.hasContacts}
                href={`/sequences/${sequence.id}/contacts`}
                onStepComplete={handleStepComplete}
              />
              <SetupStep
                step={3}
                icon={Clock}
                title="Business Hours"
                description="Set send windows"
                isCompleted={steps.hasBusinessHours}
                href={`/sequences/${sequence.id}/settings`}
                onStepComplete={handleStepComplete}
              />
              <SetupStep
                step={4}
                icon={Calendar}
                title="Attach Mailbox"
                description="Connect a sender"
                isCompleted={steps.hasMailbox}
                href={`/sequences/${sequence.id}/settings`}
                onStepComplete={handleStepComplete}
              />
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

interface SetupStepProps {
  step: number;
  icon: React.ElementType;
  title: string;
  description: string;
  isCompleted: boolean;
  href: string;
  onStepComplete?: () => void;
}

function SetupStep({
  step,
  icon: Icon,
  title,
  description,
  isCompleted,
  href,
  onStepComplete,
}: SetupStepProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (onStepComplete) {
      e.preventDefault();
      onStepComplete();
      setTimeout(() => {
        window.location.href = href;
      }, 100);
    }
  };

  return (
    <motion.a
      href={href}
      onClick={(e: React.MouseEvent) => {
        if (!isCompleted) handleClick(e);
      }}
      className={cn(
        "group relative flex h-full flex-col justify-between rounded-xl border p-4 transition-colors",
        isCompleted
          ? "border-emerald-500/25 bg-emerald-500/[0.06] dark:border-emerald-400/20 dark:bg-emerald-400/[0.06]"
          : "border-border bg-card hover:border-primary/40 hover:bg-muted/40"
      )}
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg ring-1 transition-colors",
            isCompleted
              ? "bg-emerald-500/15 text-emerald-600 ring-emerald-500/20 dark:bg-emerald-400/15 dark:text-emerald-300 dark:ring-emerald-400/25"
              : "bg-muted text-muted-foreground ring-border group-hover:text-foreground"
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>

        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums transition-colors",
            isCompleted
              ? "bg-emerald-500 text-white dark:bg-emerald-400 dark:text-emerald-950"
              : "bg-muted text-muted-foreground"
          )}
        >
          {isCompleted ? <Check className="h-3 w-3" strokeWidth={3} /> : step}
        </span>
      </div>

      <div className="mt-3 space-y-0.5">
        <h4
          className={cn(
            "text-sm font-medium leading-tight",
            isCompleted
              ? "text-emerald-800 dark:text-emerald-200"
              : "text-foreground"
          )}
        >
          {title}
        </h4>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="mt-3 flex items-center gap-1 text-xs font-medium">
        {isCompleted ? (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            Completed
          </span>
        ) : (
          <span className="flex items-center gap-1 text-primary opacity-80 transition-opacity group-hover:opacity-100">
            Set up
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        )}
      </div>
    </motion.a>
  );
}
