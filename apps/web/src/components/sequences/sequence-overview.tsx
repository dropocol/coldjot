"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { SequenceStats } from "./sequence-stats";
import { SequenceStepList } from "./steps/sequence-step-list";
import { AddSequenceStep } from "./steps/add-sequence-step";
import { SequenceStepEditor } from "./steps/sequence-step-editor";
import { SequenceEmailEditor } from "./editor/sequence-email-editor";
import { toast } from "react-hot-toast";
import type {
  SequenceStats as SequenceStatsType,
  SequenceStep,
  SequenceStatus,
  BusinessHours,
} from "@coldjot/types";

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
}

export function SequenceOverview({ sequence, stats }: SequenceOverviewProps) {
  const [steps, setSteps] = useState<SequenceStep[]>(sequence.steps);
  const [isLoading, setIsLoading] = useState(false);
  const [showStepEditor, setShowStepEditor] = useState(false);
  const [showEmailEditor, setShowEmailEditor] = useState(false);
  const [editingStep, setEditingStep] = useState<SequenceStep | null>(null);
  const [emailEditorData, setEmailEditorData] = useState<
    EmailEditorData | undefined
  >(undefined);

  const handleStepReorder = async (reorderedSteps: SequenceStep[]) => {
    try {
      setIsLoading(true);
      // Update the order and previousStepId for each step
      const updatedSteps = reorderedSteps.map((step, index) => ({
        ...step,
        order: index,
        previousStepId: index > 0 ? reorderedSteps[index - 1].id : undefined,
      }));

      // Update the steps in the database
      const response = await fetch(
        `/api/sequences/${sequence.id}/steps/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            steps: updatedSteps.map((step) => ({
              ...step,
              previousStepId: step.previousStepId ?? null,
            })),
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to reorder steps");

      // Update local state
      setSteps(updatedSteps);
      toast.success("Steps reordered successfully");
    } catch (error) {
      toast.error("Failed to reorder steps");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStepEdit = (step: SequenceStep) => {
    setEditingStep(step);
    setShowStepEditor(true);
  };

  const handleTemplateEdit = (step: SequenceStep) => {
    const currentStepIndex = steps.findIndex((s) => s.id === step.id);
    const previousStepId =
      currentStepIndex > 0 ? steps[currentStepIndex - 1].id : undefined;

    const emailData: EmailEditorData = {
      subject: step.subject ?? undefined,
      content: step.content ?? undefined,
      includeSignature: step.includeSignature,
      replyToThread: step.replyToThread ?? undefined,
      previousStepId,
    };
    setEditingStep(step);
    setEmailEditorData(emailData);
    setShowEmailEditor(true);
  };

  const handleStepAdded = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/sequences/${sequence.id}/steps`);
      if (!response.ok) throw new Error("Failed to fetch steps");
      const updatedSteps = await response.json();
      setSteps(updatedSteps);
    } catch (error) {
      toast.error("Failed to refresh steps");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSave = async (emailData: any) => {
    if (!editingStep) return;

    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/sequences/${sequence.id}/steps/${editingStep.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...editingStep,
            ...emailData,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to update step");

      const updatedSteps = await fetch(
        `/api/sequences/${sequence.id}/steps`
      ).then((res) => res.json());
      setSteps(updatedSteps);
      setShowEmailEditor(false);
      setEditingStep(null);
      setEmailEditorData(undefined);
      toast.success("Step updated successfully");
    } catch (error) {
      toast.error("Failed to update step");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStepSave = async (stepData: any) => {
    if (!editingStep) return;

    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/sequences/${sequence.id}/steps/${editingStep.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...editingStep,
            ...stepData,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to update step");

      const updatedSteps = await fetch(
        `/api/sequences/${sequence.id}/steps`
      ).then((res) => res.json());
      setSteps(updatedSteps);
      setShowStepEditor(false);
      setEditingStep(null);
      toast.success("Step settings updated successfully");
    } catch (error) {
      toast.error("Failed to update step settings");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStepDuplicate = async (step: SequenceStep) => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/sequences/${sequence.id}/steps/${step.id}/duplicate`,
        {
          method: "POST",
        }
      );

      if (!response.ok) throw new Error("Failed to duplicate step");

      const updatedSteps = await fetch(
        `/api/sequences/${sequence.id}/steps`
      ).then((res) => res.json());
      setSteps(updatedSteps);
      toast.success("Step duplicated successfully");
    } catch (error) {
      toast.error("Failed to duplicate step");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStepDelete = async (step: SequenceStep) => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/sequences/${sequence.id}/steps/${step.id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) throw new Error("Failed to delete step");

      const updatedSteps = await fetch(
        `/api/sequences/${sequence.id}/steps`
      ).then((res) => res.json());
      setSteps(updatedSteps);
      toast.success("Step deleted successfully");
    } catch (error) {
      toast.error("Failed to delete step");
    } finally {
      setIsLoading(false);
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

  // const mapStatsToDisplay = (
  //   stats: SequenceStatsType | null
  // ): SequenceStatsDisplay => ({
  //   totalEmails: 1214,
  //   sentEmails: 1214,
  //   openedEmails: 765,
  //   uniqueOpens: 391,
  //   clickedEmails: 1149,
  //   repliedEmails: 178,
  //   bouncedEmails: 0,
  //   unsubscribed: 0,
  //   interested: 0,
  //   peopleContacted: 376,
  //   openRate: 62,
  //   clickRate: 94,
  //   replyRate: 14,
  //   bounceRate: 0,
  // });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-4">Sequence Statistics</h2>
        <SequenceStats stats={mapStatsToDisplay(stats)} />
      </div>

      <div className="space-y-4">
        {isLoading ? (
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
              onStepAdded={handleStepAdded}
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
        }}
        onSave={handleStepSave}
        initialData={editingStep}
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
