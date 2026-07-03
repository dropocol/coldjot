"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http/api-client";
import { qk } from "@/lib/query/keys";
import type { SequenceStep } from "@coldjot/types";

/**
 * Steps for a sequence. GET /api/sequences/[id]/steps returns a bare array.
 * Creating / updating / deleting / reordering a step all invalidate the steps
 * list AND the parent sequence detail (step count feeds the readiness flags).
 */
export function useSequenceSteps(sequenceId: string) {
  return useQuery({
    queryKey: qk.sequences.steps(sequenceId),
    queryFn: () => api.get<SequenceStep[]>(`/api/sequences/${sequenceId}/steps`),
    enabled: !!sequenceId,
  });
}

function invalidateSteps(
  qc: ReturnType<typeof useQueryClient>,
  sequenceId: string
) {
  qc.invalidateQueries({ queryKey: qk.sequences.steps(sequenceId) });
  // Steps count affects the sequence detail (readiness hasSteps).
  qc.invalidateQueries({ queryKey: qk.sequences.detail(sequenceId) });
}

export function useCreateStep(sequenceId: string) {
  const qc = useQueryClient();
  return useMutation({
    // POST returns the bare created step.
    mutationFn: (input: Partial<SequenceStep>) =>
      api.post<SequenceStep>(`/api/sequences/${sequenceId}/steps`, input),
    onSuccess: () => invalidateSteps(qc, sequenceId),
  });
}

export function useUpdateStep(sequenceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stepId, patch }: { stepId: string; patch: Partial<SequenceStep> }) =>
      api
        .put<SequenceStep>(`/api/sequences/${sequenceId}/steps/${stepId}`, patch)
        .then((step) => ({ stepId, step })),
    onSuccess: () => invalidateSteps(qc, sequenceId),
  });
}

export function useDeleteStep(sequenceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stepId: string) =>
      api.delete<{ success: true }>(
        `/api/sequences/${sequenceId}/steps/${stepId}`
      ),
    onSuccess: () => invalidateSteps(qc, sequenceId),
  });
}

export function useDuplicateStep(sequenceId: string) {
  const qc = useQueryClient();
  return useMutation({
    // Duplicate = create a new step with the source step's data (minus its id).
    mutationFn: (source: SequenceStep) => {
      const { id: _id, ...stepData } = source;
      return api.post<SequenceStep>(`/api/sequences/${sequenceId}/steps`, {
        ...stepData,
      });
    },
    onSuccess: () => invalidateSteps(qc, sequenceId),
  });
}

export function useReorderSteps(sequenceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (steps: SequenceStep[]) =>
      api.post<{ success: true }>(`/api/sequences/${sequenceId}/steps/reorder`, {
        // Normalize previousStepId to null (API rejects undefined in JSON).
        steps: steps.map((step, index) => ({
          ...step,
          order: index,
          previousStepId:
            index > 0 ? steps[index - 1].id : (null as string | null),
        })),
      }),
    onMutate: async (steps) => {
      // Optimistic reorder so the drag feels instant.
      await qc.cancelQueries({ queryKey: qk.sequences.steps(sequenceId) });
      const optimistic = steps.map((step, index) => ({
        ...step,
        order: index,
        previousStepId: index > 0 ? steps[index - 1].id : step.previousStepId,
      }));
      qc.setQueryData<SequenceStep[]>(qk.sequences.steps(sequenceId), optimistic);
      return { previous: qc.getQueryData<SequenceStep[]>(qk.sequences.steps(sequenceId)) };
    },
    onError: (_err, _steps, context) => {
      if (context?.previous) {
        qc.setQueryData(qk.sequences.steps(sequenceId), context.previous);
      }
    },
    onSuccess: () => invalidateSteps(qc, sequenceId),
  });
}
