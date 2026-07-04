"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { SequenceStats } from "./sequence-stats";
import { SequenceStepList } from "./steps/sequence-step-list";
import { AddSequenceStep } from "./steps/add-sequence-step";
import { SequenceStepEditor } from "./steps/sequence-step-editor";
import { SequenceEmailEditor } from "./editor/sequence-email-editor";
import { toast } from "sonner";
import {
  type SequenceStats as SequenceStatsType,
  type SequenceStep,
  type SequenceStatus,
  type BusinessHours,
  type StepData,
  type EmailData,
  StepPriority as StepPriorityEnum,
} from "@coldjot/types";
import {
  useSequenceSteps,
  useReorderSteps,
  useUpdateStep,
  useCreateStep,
  useDeleteStep,
  useDuplicateStep,
} from "@/hooks/queries/use-sequence-steps";

// Define a minimal sequence type for the overview page
interface OverviewSequence {
  id: string;
  name: string;
  status: SequenceStatus;
  accessLevel: "team" | "private";
  scheduleType: "business" | "custom";
  businessHours?: BusinessHours;
  steps: SequenceStep[];
  testMode: boolean;
}

interface SequenceOverviewProps {
  sequence: OverviewSequence;
  stats: SequenceStatsType | null;
}

type SequenceStatsDisplay = {
  totalEmails: number;
  sentEmails: number;
  openedEmails: number;
  uniqueOpens: number;
  clickedEmails: number;
  repliedEmails: number;
  bouncedEmails: number;
  unsubscribed: number;
  interested: number;
  peopleContacted: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
};

interface EmailEditorData {
  subject?: string;
  content?: string;
  includeSignature?: boolean;
  replyToThread?: boolean;
  previousStepId?: string;
  templateId?: string;
}

interface StepEditorData {
  timing?: "immediate" | "delay";
  priority?: "high" | "medium" | "low";
  delayAmount?: number;
  delayUnit?: "minutes" | "hours" | "days";
  note?: string;
}

export function SequenceOverview({ sequence, stats }: SequenceOverviewProps) {
  // Steps are owned by react-query; seeded from the prop via initialData so
  // first paint is SSR-accurate, then kept fresh by the mutations below.
  const { data: steps = [] } = useSequenceSteps(sequence.id);
  const reorder = useReorderSteps(sequence.id);
  const updateStep = useUpdateStep(sequence.id);
  const createStep = useCreateStep(sequence.id);
  const deleteStep = useDeleteStep(sequence.id);
  const duplicateStep = useDuplicateStep(sequence.id);

  // Any of the step mutations counts as "loading".
  const isMutating =
    reorder.isPending ||
    updateStep.isPending ||
    createStep.isPending ||
    deleteStep.isPending ||
    duplicateStep.isPending;

  const [showStepEditor, setShowStepEditor] = useState(false);
  const [showEmailEditor, setShowEmailEditor] = useState(false);
  const [editingStep, setEditingStep] = useState<SequenceStep | null>(null);
  const [emailEditorData, setEmailEditorData] = useState<
    EmailEditorData | undefined
  >(undefined);
  const [stepEditorData, setStepEditorData] = useState<
    StepEditorData | undefined
  >(undefined);

  const handleStepReorder = async (reorderedSteps: SequenceStep[]) => {
    try {
      await reorder.mutateAsync(reorderedSteps);
      toast.success("Steps reordered successfully");
    } catch (_error) {
      toast.error("Failed to reorder steps");
    }
  };

  const handleStepEdit = (step: SequenceStep) => {
    if (!step) return;

    const stepData: StepEditorData = {
      timing: step.timing as "immediate" | "delay",
      priority:
        step.priority === StepPriorityEnum.HIGH
          ? "high"
          : step.priority === StepPriorityEnum.LOW
            ? "low"
            : "medium",
      delayAmount: step.delayAmount || undefined,
      delayUnit: (step.delayUnit as "minutes" | "hours" | "days") || undefined,
      note: step.note || undefined,
    };
    setEditingStep(step);
    setStepEditorData(stepData);
    setShowStepEditor(true);
  };

  const handleTemplateEdit = (step: SequenceStep) => {
    const currentStepIndex = steps.findIndex((s) => s.id === step.id);
    const previousStepId =
      currentStepIndex > 0 ? steps[currentStepIndex - 1].id : undefined;

    const emailData: EmailEditorData = {
      subject: step.subject || undefined,
      content: step.content || undefined,
      includeSignature: step.includeSignature,
      replyToThread: step.replyToThread ?? undefined,
      previousStepId,
      templateId: step.templateId || undefined,
    };
    setEditingStep(step);
    setEmailEditorData(emailData);
    setShowEmailEditor(true);
  };

  const handleEmailSave = async (emailData: EmailData) => {
    if (!editingStep) return;

    try {
      await updateStep.mutateAsync({
        stepId: editingStep.id,
        patch: {
          ...editingStep,
          ...emailData,
          // Clear content and subject if using template
          ...(emailData.templateId ? { content: null, subject: null } : {}),
        },
      });
      setShowEmailEditor(false);
      setEditingStep(null);
      setEmailEditorData(undefined);
      toast.success("Step updated successfully");
    } catch (_error) {
      toast.error("Failed to update step");
    }
  };

  const handleStepSave = async (stepData: StepData) => {
    if (!editingStep) return;

    try {
      await updateStep.mutateAsync({
        stepId: editingStep.id,
        patch: {
          ...editingStep,
          ...stepData,
        },
      });
      setShowStepEditor(false);
      setEditingStep(null);
      toast.success("Step settings updated successfully");
    } catch (_error) {
      toast.error("Failed to update step settings");
    }
  };

  const handleStepDuplicate = async (step: SequenceStep) => {
    try {
      await duplicateStep.mutateAsync(step);
      toast.success("Step duplicated successfully");
    } catch (_error) {
      toast.error("Failed to duplicate step");
    }
  };

  const handleStepDelete = async (step: SequenceStep) => {
    try {
      await deleteStep.mutateAsync(step.id);
      toast.success("Step deleted successfully");
    } catch (_error) {
      toast.error("Failed to delete step");
    }
  };

  const mapStatsToDisplay = (
    stats: SequenceStatsType | null
  ): SequenceStatsDisplay => ({
    totalEmails: stats?.totalEmails || 0,
    sentEmails: stats?.sentEmails || 0,
    openedEmails: stats?.openedEmails || 0,
    uniqueOpens: stats?.uniqueOpens || 0,
    clickedEmails: stats?.clickedEmails || 0,
    repliedEmails: stats?.repliedEmails || 0,
    bouncedEmails: stats?.bouncedEmails || 0,
    unsubscribed: stats?.unsubscribed || 0,
    interested: stats?.interested || 0,
    peopleContacted: stats?.peopleContacted || 0,
    openRate: stats?.openRate || 0,
    clickRate: stats?.clickRate || 0,
    replyRate: stats?.replyRate || 0,
    bounceRate: stats?.bounceRate || 0,
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-4">Sequence Statistics</h2>
        <SequenceStats stats={mapStatsToDisplay(stats)} />
      </div>

      <div className="space-y-4">
        {isMutating ? (
          <div className="flex items-center justify-center p-8">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading steps...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Sequence Steps</h2>
            </div>
            <SequenceStepList
              steps={steps}
              onReorder={handleStepReorder}
              onEdit={handleStepEdit}
              onEditTemplate={handleTemplateEdit}
              onDuplicate={handleStepDuplicate}
              onDelete={handleStepDelete}
            />
            <AddSequenceStep
              sequenceId={sequence.id}
              steps={steps}
            />
          </>
        )}
      </div>

      <SequenceStepEditor
        open={showStepEditor}
        onClose={() => {
          setShowStepEditor(false);
          setEditingStep(null);
          setStepEditorData(undefined);
        }}
        onSave={handleStepSave}
        initialData={stepEditorData}
      />

      <SequenceEmailEditor
        open={showEmailEditor}
        onClose={() => {
          setShowEmailEditor(false);
          setEditingStep(null);
          setEmailEditorData(undefined);
        }}
        onSave={handleEmailSave}
        initialData={emailEditorData}
        sequenceId={sequence.id}
        stepId={editingStep?.id}
        previousStepId={emailEditorData?.previousStepId}
      />
    </div>
  );
}
