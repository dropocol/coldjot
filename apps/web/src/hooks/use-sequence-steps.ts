import { useState, useCallback } from "react";
import { toast } from "react-hot-toast";
import type { SequenceStep } from "@coldjot/types";

export function useSequenceSteps(sequenceId: string) {
  const [steps, setSteps] = useState<SequenceStep[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSteps = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/sequences/${sequenceId}/steps`);
      if (!response.ok) throw new Error("Failed to fetch steps");
      const data = await response.json();
      setSteps(data);
    } catch (error) {
      console.error("Error fetching steps:", error);
      toast.error("Failed to load steps");
    } finally {
      setIsLoading(false);
    }
  }, [sequenceId]);

  const reorderSteps = async (reorderedSteps: SequenceStep[]) => {
    try {
      const response = await fetch(
        `/api/sequences/${sequenceId}/steps/reorder`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ steps: reorderedSteps }),
        }
      );

      if (!response.ok) throw new Error("Failed to reorder steps");
      setSteps(reorderedSteps);
    } catch (error) {
      toast.error("Failed to reorder steps");
      throw error;
    }
  };

  const duplicateStep = async (step: SequenceStep) => {
    try {
      setIsLoading(true);
      const { id: _id, ...stepData } = step;
      const response = await fetch(`/api/sequences/${sequenceId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...stepData,
          order: steps.length,
        }),
      });

      if (!response.ok) throw new Error("Failed to duplicate step");
      const newStep = await response.json();
      setSteps([...steps, newStep]);
      toast.success("Step duplicated successfully");
    } catch (_error) {
      toast.error("Failed to duplicate step");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteStep = async (step: SequenceStep) => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/sequences/${sequenceId}/steps/${step.id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) throw new Error("Failed to delete step");
      setSteps(steps.filter((s) => s.id !== step.id));
      toast.success("Step deleted successfully");
    } catch (_error) {
      toast.error("Failed to delete step");
    } finally {
      setIsLoading(false);
    }
  };

  return {
    steps,
    setSteps,
    isLoading,
    reorderSteps,
    duplicateStep,
    deleteStep,
    fetchSteps,
  };
}
