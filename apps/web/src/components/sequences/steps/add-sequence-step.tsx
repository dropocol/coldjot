"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { SequenceStepEditor } from "./sequence-step-editor";
import { SequenceEmailEditor } from "../editor/sequence-email-editor";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";
import type { SequenceStep, StepData, EmailData } from "@coldjot/types";
import { addStepToSequence } from "@/lib/client-actions";
import { useSequence } from "@/lib/sequence-context";

interface AddSequenceStepProps {
  sequenceId: string;
  onStepAdded?: () => void;
  steps: SequenceStep[];
}

type ActiveDrawer = "none" | "step" | "email";

export function AddSequenceStep({
  sequenceId,
  onStepAdded,
  steps,
}: AddSequenceStepProps) {
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>("none");
  const [stepData, setStepData] = useState<StepData | null>(null);
  const [emailData, setEmailData] = useState<EmailData | null>(null);
  const router = useRouter();
  const { updateReadinessField } = useSequence();

  const handleStepSave = async (data: StepData) => {
    setStepData(data);
    setActiveDrawer("email");
  };

  const handleEmailSave = async (data: EmailData) => {
    if (!stepData) return;

    try {
      const previousStepId =
        steps.length > 0 ? steps[steps.length - 1].id : undefined;

      const stepDataToSave = {
        ...stepData,
        ...data,
        order: steps.length,
        previousStepId,
        replyToThread: data.replyToThread,
      };

      await addStepToSequence(sequenceId, stepDataToSave, updateReadinessField);

      toast.success("Step added successfully");
      setActiveDrawer("none");
      setStepData(null);
      setEmailData(null);
      onStepAdded?.();
    } catch (error) {
      console.error("Error adding step:", error);
      toast.error("Failed to add step");
    }
  };

  return (
    <>
      <Button
        onClick={() => setActiveDrawer("step")}
        className="w-full h-12 bg-neutral-50 rounded-lg hover:bg-neutral-100 hover:border hover:border-gray-300"
        variant="secondary"
      >
        <Plus className="h-4 w-4 max-w-full mr-2" />
        Add a step
      </Button>

      <SequenceStepEditor
        open={activeDrawer === "step"}
        onClose={() => setActiveDrawer("none")}
        onSave={handleStepSave}
      />

      <SequenceEmailEditor
        open={activeDrawer === "email"}
        onClose={() => setActiveDrawer("none")}
        onSave={handleEmailSave}
        sequenceId={sequenceId}
        previousStepId={
          steps.length > 0 ? steps[steps.length - 1].id : undefined
        }
      />
    </>
  );
}
