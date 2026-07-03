import { useState } from "react";
import { toast } from "react-hot-toast";
import { Sequence, SequenceStep } from "@coldjot/types";

export const useSequences = () => {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSequences = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/sequences");
      if (!response.ok) throw new Error("Failed to fetch sequences");

      const data = await response.json();
      setSequences(data);
    } catch (_error) {
      toast.error("Failed to load sequences");
    } finally {
      setIsLoading(false);
    }
  };

  const createSequence = async (data: {
    name: string;
    permissions: "team" | "private";
    schedule: "business" | "custom";
  }) => {
    try {
      const response = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error("Failed to create sequence");

      const sequence = await response.json();
      setSequences((prev) => [...prev, sequence]);
      return sequence;
    } catch (error) {
      toast.error("Failed to create sequence");
      throw error;
    }
  };

  const addStep = async (sequenceId: string, data: Partial<SequenceStep>) => {
    try {
      const response = await fetch(`/api/sequences/${sequenceId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error("Failed to add step");

      const step = await response.json();
      setSequences((prev) =>
        prev.map((seq) =>
          seq.id === sequenceId ? { ...seq, steps: [...seq.steps, step] } : seq
        )
      );
      return step;
    } catch (error) {
      toast.error("Failed to add step");
      throw error;
    }
  };

  return {
    sequences,
    isLoading,
    fetchSequences,
    createSequence,
    addStep,
  };
};
